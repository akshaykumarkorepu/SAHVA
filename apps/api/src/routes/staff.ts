import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { uuid, validate } from "../middleware/validate.js";
import { badRequest, forbidden, unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";
import { env } from "../config/env.js";

export const staff = Router();

/** Everyone who can sign in to this clinic. */
staff.get(
  "/",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const rows = unwrap(
      await db
        .from("clinic_members")
        .select("clinic_id, staff_id, role, status, invited_at, joined_at, staff_profiles(id, full_name, phone_e164, locale)")
        .eq("clinic_id", clinicId)
        .order("role"),
      "staff",
    );
    res.json(rows);
  }),
);

const inviteBody = z.object({
  email: z.string().trim().email().max(150),
  full_name: z.string().trim().min(2).max(100),
  role: z.enum(["owner", "manager", "receptionist", "doctor"]).default("receptionist"),
});

/**
 * Invite a staff member.
 *
 * Self-signup is disabled, so this is the only way an account comes into
 * existence. It needs the Supabase auth admin API, which means service_role —
 * hence the explicit role gate above it, because RLS cannot protect this path.
 */
staff.post(
  "/invite",
  requireRole("owner", "manager"),
  validate({ body: inviteBody }),
  asyncRoute(async (req, res) => {
    const { clinicId, userId, role: callerRole } = req.auth!;
    const b = req.body as z.infer<typeof inviteBody>;

    // A manager must not be able to mint an owner and take over the clinic.
    if (b.role === "owner" && callerRole !== "owner") {
      throw forbidden("Only an owner can invite another owner.");
    }

    const invited = await dbAdmin.auth.admin.inviteUserByEmail(b.email, {
      data: { full_name: b.full_name },
      redirectTo: `${env.CORS_ORIGINS[0]}/login`,
    });

    let staffId = invited.data.user?.id;

    if (invited.error) {
      // Already has an account — invite them to this clinic rather than failing.
      const existing = await dbAdmin.auth.admin.listUsers();
      const match = existing.data.users.find(
        (u) => u.email?.toLowerCase() === b.email.toLowerCase(),
      );
      if (!match) {
        req.log.error({ err: invited.error }, "invite failed");
        throw badRequest("INVITE_FAILED", invited.error.message);
      }
      staffId = match.id;
    }

    if (!staffId) throw badRequest("INVITE_FAILED", "Could not resolve the invited user.");

    // The on_auth_user_created trigger makes staff_profiles; ensure it exists
    // for a pre-existing account too.
    await dbAdmin
      .from("staff_profiles")
      .upsert({ id: staffId, full_name: b.full_name }, { onConflict: "id" });

    const member = unwrap(
      await dbAdmin
        .from("clinic_members")
        .upsert(
          {
            clinic_id: clinicId,
            staff_id: staffId,
            role: b.role,
            status: "invited",
            invited_by: userId,
          },
          { onConflict: "clinic_id,staff_id" },
        )
        .select()
        .single(),
      "membership",
    );

    req.log.info({ invitedStaffId: staffId, role: b.role }, "staff invited");
    res.status(201).json(member);
  }),
);

const memberPatch = z.object({
  role: z.enum(["owner", "manager", "receptionist", "doctor"]).optional(),
  status: z.enum(["invited", "active", "suspended"]).optional(),
});

staff.patch(
  "/:staffId",
  requireRole("owner", "manager"),
  validate({ params: z.object({ staffId: uuid }), body: memberPatch }),
  asyncRoute(async (req, res) => {
    const { db, clinicId, userId, role: callerRole } = req.auth!;
    const b = req.body as z.infer<typeof memberPatch>;

    if (req.params.staffId === userId && b.role && b.role !== callerRole) {
      throw badRequest("CANNOT_DEMOTE_SELF", "You cannot change your own role.");
    }
    if (b.role === "owner" && callerRole !== "owner") {
      throw forbidden("Only an owner can promote someone to owner.");
    }

    const row = unwrap(
      await db
        .from("clinic_members")
        .update({ ...b, ...(b.status === "active" ? { joined_at: new Date().toISOString() } : {}) })
        .eq("clinic_id", clinicId)
        .eq("staff_id", req.params.staffId)
        .select()
        .single(),
      "membership",
    );
    res.json(row);
  }),
);

/**
 * Remove someone from the clinic. Their auth account is left alone — they may
 * belong to another clinic, and deleting accounts is not something a clinic
 * manager should be able to do from a dashboard.
 */
staff.delete(
  "/:staffId",
  requireRole("owner"),
  validate({ params: z.object({ staffId: uuid }) }),
  asyncRoute(async (req, res) => {
    const { db, clinicId, userId } = req.auth!;
    if (req.params.staffId === userId) {
      throw badRequest("CANNOT_REMOVE_SELF", "You cannot remove yourself from the clinic.");
    }
    const { error } = await db
      .from("clinic_members")
      .delete()
      .eq("clinic_id", clinicId)
      .eq("staff_id", req.params.staffId);
    if (error) throw error;
    req.log.warn({ removedStaffId: req.params.staffId }, "staff removed from clinic");
    res.status(204).end();
  }),
);
