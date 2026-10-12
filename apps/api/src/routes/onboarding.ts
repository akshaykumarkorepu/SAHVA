import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { phoneE164, validate } from "../middleware/validate.js";
import { applicationError } from "../lib/applicationErrors.js";

export const onboarding = Router();

const optional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/**
 * Apply for a clinic. The signed-in person becomes its owner and can set it
 * up straight away, but nothing reaches patients, and there is no trial,
 * until a SAHVA admin has checked the facility and doctor registrations.
 */
onboarding.post(
  "/clinic",
  validate({
    body: z
      .object({
        name: z.string().trim().min(2).max(150),
        address: optional(200),
        city: z.string().trim().min(2).max(80),
        pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "a 6-digit PIN code").optional().or(z.literal("").transform(() => undefined)),
        phone: phoneE164,
        hfr_id: optional(32),
        establishment_reg_no: optional(64),
        registration_state: optional(60),
        owner_reg_no: z.string().trim().min(3).max(32),
        owner_council: z.string().trim().min(3).max(120),
        gstin: optional(15),
      })
      .refine((b) => !!b.hfr_id || (!!b.establishment_reg_no && !!b.registration_state), {
        message: "Give an HFR ID, or a state registration number and its state",
        path: ["hfr_id"],
      }),
  }),
  asyncRoute(async (req, res) => {
    const { db } = req.user!;
    const b = req.body as Record<string, string | undefined>;
    const { data, error } = await db.rpc("submit_clinic_application", {
      p_name: b.name!,
      p_address: b.address ?? "",
      p_city: b.city!,
      p_pincode: b.pincode ?? "",
      p_phone: b.phone!,
      p_hfr_id: b.hfr_id ?? "",
      p_est_reg_no: b.establishment_reg_no ?? "",
      p_reg_state: b.registration_state ?? "",
      p_owner_reg_no: b.owner_reg_no!,
      p_owner_council: b.owner_council!,
      p_gstin: b.gstin ?? "",
    });
    if (error) throw applicationError(error);
    res.status(201).json({ clinic_id: data });
  }),
);
