import { Router } from "express";
import { db } from "../db/client.js";

export const clinic = Router();

clinic.get("/", (_req, res) => {
  const row = db.prepare("SELECT * FROM clinics ORDER BY id ASC LIMIT 1").get();
  if (!row) return res.status(404).json({ error: "No clinic configured" });
  res.json(row);
});
