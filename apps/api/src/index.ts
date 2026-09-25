import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env, isProd } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { requestContext } from "./middleware/context.js";
import { requireAuth, requireServiceKey } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

import { clinic } from "./routes/clinic.js";
import { doctors } from "./routes/doctors.js";
import { patients } from "./routes/patients.js";
import { appointments } from "./routes/appointments.js";
import { calls } from "./routes/calls.js";
import { analytics } from "./routes/analytics.js";
import { actions } from "./routes/actions.js";
import { messages } from "./routes/messages.js";
import { voice } from "./routes/voice.js";

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
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, env: env.NODE_ENV, ts: new Date().toISOString() }),
);

// --- Machine routes --------------------------------------------------------
// Telephony and the voice orchestrator carry no user JWT, so they authenticate
// with a shared secret and resolve tenancy from the dialed number. These get a
// higher limit: one call is many turns.
const machineLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX * 5,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/voice", machineLimiter, requireServiceKey("voice"), voice);
app.use("/api/webhooks/messages", machineLimiter, requireServiceKey("telephony"), messages);

// --- Staff routes ----------------------------------------------------------
// Everything below requires a signed-in staff user. `requireAuth` resolves the
// clinic from clinic_members — never from the request — and attaches an
// RLS-scoped Supabase client. On `main` this middleware existed but was never
// mounted; every dashboard route was open.
const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

// Note: this also means an unauthenticated request to a non-existent /api
// route gets 401 rather than 404. That is deliberate — route existence is not
// something an anonymous caller should be able to enumerate.
app.use("/api", apiLimiter, requireAuth);
app.use("/api/clinic", clinic);
app.use("/api/doctors", doctors);
app.use("/api/patients", patients);
app.use("/api/appointments", appointments);
app.use("/api/calls", calls);
app.use("/api/analytics", analytics);
app.use("/api/actions", actions);
app.use("/api/messages", messages);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, supabase: new URL(env.SUPABASE_URL).host },
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
