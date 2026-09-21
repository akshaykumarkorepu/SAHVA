import { Router } from "express";
import { buildWhatsAppPreview } from "../lib/whatsapp.js";

export const whatsapp = Router();

whatsapp.post("/preview", (req, res) => {
  const { appointmentId } = req.body as { appointmentId?: number };
  if (!appointmentId) return res.status(400).json({ error: "appointmentId required" });
  const preview = buildWhatsAppPreview(appointmentId);
  if (!preview) return res.status(404).json({ error: "Appointment not found" });
  res.json(preview);
});
