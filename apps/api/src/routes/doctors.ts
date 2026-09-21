import { Router } from "express";
import { db } from "../db/client.js";

export const doctors = Router();

doctors.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT id, name, specialty, languages FROM doctors ORDER BY name ASC")
    .all();
  res.json(rows);
});
