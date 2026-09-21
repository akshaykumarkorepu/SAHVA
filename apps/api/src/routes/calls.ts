import { Router } from "express";
import { db } from "../db/client.js";

export const calls = Router();

const SELECT_JOINED = `
  SELECT c.id, c.clinic_id, c.patient_id, c.started_at, c.ended_at, c.outcome, c.language,
         c.transcript, c.summary, c.was_missed_before_ai,
         p.name AS patient_name, p.phone AS patient_phone
  FROM calls c
  LEFT JOIN patients p ON p.id = c.patient_id
`;

calls.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const outcome = req.query.outcome as string | undefined;
  const where = outcome ? " WHERE c.outcome = ?" : "";
  const params = outcome ? [outcome] : [];
  const rows = db
    .prepare(
      SELECT_JOINED + where + " ORDER BY c.started_at DESC LIMIT ?"
    )
    .all(...params, limit);
  res.json(
    rows.map((r: any) => ({
      ...r,
      transcript: safeParse(r.transcript),
    }))
  );
});

calls.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(SELECT_JOINED + " WHERE c.id = ?").get(id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  row.transcript = safeParse(row.transcript);
  res.json(row);
});

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}
