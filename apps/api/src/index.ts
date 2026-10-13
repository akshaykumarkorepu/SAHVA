import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env, isProd } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { requestContext } from "./middleware/context.js";
import { securityEvents } from "./lib/securityEvents.js";
import { requireAuth, requireServiceKey, requireUser } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

import { clinic } from "./routes/clinic.js";
import { doctors } from "./routes/doctors.js";
import { patients } from "./routes/patients.js";
import { appointments } from "./routes/appointments.js";
import { calls } from "./routes/calls.js";
import { analytics } from "./routes/analytics.js";
import { actions } from "./routes/actions.js";
import { messages } from "./routes/messages.js";
import { knowledge } from "./routes/knowledge.js";
import { staff } from "./routes/staff.js";
import { voice } from "./routes/voice.js";
import { portal } from "./routes/portal.js";
import { onboarding } from "./routes/onboarding.js";
import { admin } from "./routes/admin.js";
import { adminEligibility, requirePlatformAdmin, whoami } from "./middleware/admin.js";
import { billing } from "./routes/billing.js";
import { razorpayWebhook } from "./routes/razorpayWebhook.js";
import { reconcile } from "./lib/reconcile.js";
import { runNotifications } from "./lib/notifications.js";
import { patientAccount } from "./routes/patientAccount.js";
import {
  apiLimiter,
  initRateLimitStore,
  machineLimiter,
  portalLimiter,
} from "./middleware/rateLimit.js";

const app = express();

// Behind Vercel/Railway/Fly, the client IP arrives in X-Forwarded-For. Without
// this, rate limiting would bucket every request under the proxy's address.
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-sahva-key", "x-request-id"],
    exposedHeaders: ["x-request-id"],
  }),
);
// requestContext must precede the body parser: a malformed-JSON error is
// thrown by express.json(), and without a request id already attached that
// response comes back untraceable.
app.use(requestContext);
// Refused requests (401/403/429) go to security_events, after the response.
app.use(securityEvents);
// Before express.json: Razorpay signs the raw bytes it sent.
app.post("/api/webhooks/razorpay", machineLimiter(), express.raw({ type: "*/*", limit: "100kb" }), razorpayWebhook);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, env: env.NODE_ENV, ts: new Date().toISOString() }),
);

// --- Machine routes --------------------------------------------------------
// Telephony and the voice orchestrator carry no user JWT, so they authenticate
// with a shared secret and resolve tenancy from the dialed number. These get a
// higher limit: one call is many turns.
app.use("/api/voice", machineLimiter(), requireServiceKey("voice"), voice);

// Patient surfaces. Mounted before the staff auth gate: a patient holds either
// a capability link or their own session, never a staff one.
//
// Account creation is mounted FIRST so its stricter limiter applies before the
// general portal limiter — credential endpoints get 8 attempts per 15 minutes,
// keyed by IP and the account under attack.
app.use("/api", patientAccount);
app.use("/api/portal", portalLimiter(), portal);
app.use("/api/webhooks/messages", machineLimiter(), requireServiceKey("telephony"), messages);
// Scheduled jobs (Render cron, GitHub Actions): nightly payment reconciliation.
app.post("/api/internal/reconcile-payments", machineLimiter(), requireServiceKey("worker"), async (req, res, next) => {
  try {
    const summary = await reconcile();
    req.log.info({ summary }, "payment reconciliation");
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// Every 15 minutes: reminders that time made due, invoices owed, emails to send.
app.post("/api/internal/notifications/run", machineLimiter(), requireServiceKey("worker"), async (req, res, next) => {
  try {
    const summary = await runNotifications();
    req.log.info({ summary }, "notifications run");
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// --- Staff routes ----------------------------------------------------------
// Everything below requires a signed-in staff user. `requireAuth` resolves the
// clinic from clinic_members — never from the request — and attaches an
// RLS-scoped Supabase client. On `main` this middleware existed but was never
// mounted; every dashboard route was open.
// Note: this also means an unauthenticated request to a non-existent /api
// route gets 401 rather than 404. That is deliberate — route existence is not
// something an anonymous caller should be able to enumerate.
// SAHVA's own admins. Not clinic members, so mounted before the clinic gate;
// requirePlatformAdmin insists on a second factor and a platform_admins row.
app.get("/api/admin-eligibility", apiLimiter(), adminEligibility);
// Any signed-in account: is it staff, a patient, an admin? Sign-in routes by it.
app.get("/api/whoami", apiLimiter(), whoami);
app.use("/api/admin", apiLimiter(), requirePlatformAdmin, admin);

// Signed in, but possibly without a clinic yet: the only thing such a user
// can do is create one.
app.use("/api/onboarding", apiLimiter(), requireUser, onboarding);

app.use("/api", apiLimiter(), requireAuth);
app.use("/api/clinic", clinic);
app.use("/api/doctors", doctors);
app.use("/api/patients", patients);
app.use("/api/appointments", appointments);
app.use("/api/calls", calls);
app.use("/api/analytics", analytics);
app.use("/api/actions", actions);
app.use("/api/messages", messages);
app.use("/api/knowledge", knowledge);
app.use("/api/staff", staff);
app.use("/api/billing", billing);

app.use(notFoundHandler);
app.use(errorHandler);

// Resolve the rate-limit store before listening, so the first request is
// already counted against the shared store rather than a local one.
const rateLimitBackend = await initRateLimitStore();

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      supabase: new URL(env.SUPABASE_URL).host,
      rateLimit: rateLimitBackend,
    },
    "api listening",
  );
  if (!isProd) logger.info(`http://localhost:${env.PORT}/api/health`);
});

// Finish in-flight requests before exiting. A container restart should not drop
// a booking that is mid-transaction.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandled rejection");
});
