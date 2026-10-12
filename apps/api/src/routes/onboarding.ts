import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { phoneE164, validate } from "../middleware/validate.js";
import { conflict, fromPostgrest } from "../lib/errors.js";

export const onboarding = Router();

/**
 * Create the signed-in person's clinic, with them as owner, on a 14-day
 * free trial. No card. The database refuses a second clinic for the same
 * account, so the trial cannot be repeated from one login.
 */
onboarding.post(
  "/clinic",
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(150),
      city: z.string().trim().min(2).max(80),
      phone: phoneE164,
    }),
  }),
  asyncRoute(async (req, res) => {
    const { db } = req.user!;
    const b = req.body as { name: string; city: string; phone: string };
    const { data, error } = await db.rpc("create_clinic_with_trial", {
      p_name: b.name,
      p_city: b.city,
      p_phone: b.phone,
    });
    if (error) {
      if (error.code === "23505") {
        throw /already belongs/.test(error.message)
          ? conflict("ALREADY_HAS_CLINIC", "This account already has a clinic.", "Sign in to open its dashboard.")
          : conflict("PHONE_TAKEN", "A clinic with this phone number is already registered.");
      }
      throw fromPostgrest(error, "creating the clinic");
    }
    res.status(201).json({ clinic_id: data });
  }),
);
