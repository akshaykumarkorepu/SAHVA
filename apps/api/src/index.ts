import "dotenv/config";
import express from "express";
import cors from "cors";
import { seedIfEmpty } from "./db/seed.js";
import { clinic } from "./routes/clinic.js";
import { doctors } from "./routes/doctors.js";
import { patients } from "./routes/patients.js";
import { appointments } from "./routes/appointments.js";
import { calls } from "./routes/calls.js";
import { analytics } from "./routes/analytics.js";
import { voice } from "./routes/voice.js";
import { whatsapp } from "./routes/whatsapp.js";

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use("/api/clinic", clinic);
app.use("/api/doctors", doctors);
app.use("/api/patients", patients);
app.use("/api/appointments", appointments);
app.use("/api/calls", calls);
app.use("/api/analytics", analytics);
app.use("/api/voice", voice);
app.use("/api/whatsapp", whatsapp);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api error]", err);
  const message = err instanceof Error ? err.message : "Internal error";
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
