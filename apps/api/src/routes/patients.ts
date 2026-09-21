import { Router } from "express";
import { db } from "../db/client.js";

export const patients = Router();

patients.get("/", (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (q) {
    const rows = db
      .prepare(
        "SELECT * FROM patients WHERE name LIKE ? OR phone LIKE ? ORDER BY name ASC LIMIT 100"
      )
      .all(`%${q}%`, `%${q}%`);
    return res.json(rows);
  }
  const rows = db.prepare("SELECT * FROM patients ORDER BY name ASC LIMIT 100").all();
  res.json(rows);
});
