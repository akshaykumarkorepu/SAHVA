import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { uuid, validate } from "../middleware/validate.js";
import { requireAdminRole } from "../middleware/admin.js";
import { fromPostgrest, unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";
import { logAdminAction } from "../lib/adminAudit.js";
import { overview } from "../lib/adminMetrics.js";

/**
 * The admin API. Mounted behind requirePlatformAdmin, so every handler here
 * already knows it is talking to an admin who passed a second factor. Reads
 * use the service role because they span every clinic.
 */
export const admin = Router();

admin.get(
  "/me",
  asyncRoute(async (req, res) => {
    const a = req.admin!;
    res.json({ email: a.email, role: a.role, full_name: a.fullName });
  }),
);

/** Called once after sign-in completes, so every admin session is on record. */
admin.post(
  "/sessions",
  asyncRoute(async (req, res) => {
    await logAdminAction(req, { action: "admin.sign_in" });
    res.status(201).json({ ok: true });
  }),
);

admin.get(
  "/overview",
  asyncRoute(async (_req, res) => {
    const [clinics, subs, payments, plan] = await Promise.all([
      dbAdmin.from("clinics").select("created_at"),
      dbAdmin.from("subscriptions").select("clinic_id, status, billing_cycle, current_period_end, trial_ends_at"),
      dbAdmin.from("subscription_payments").select("amount_paise, paid_at, status"),
      dbAdmin.from("plans").select("monthly_price_paise, yearly_price_paise").eq("code", "starter").single(),
    ]);
    res.json(
      overview({
        clinics: unwrap(clinics, "clinics"),
        subs: unwrap(subs, "subscriptions"),
        payments: unwrap(payments, "payments"),
        price: unwrap(plan, "plan"),
      }),
    );
  }),
);

admin.get(
  "/audit",
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }) }),
  asyncRoute(async (req, res) => {
    const { limit } = req.query as unknown as { limit: number };
    const rows = unwrap(
      await dbAdmin
        .from("admin_audit_log")
        .select("id, action, target_type, target_id, reason, created_at, platform_admins(full_name)")
        .order("created_at", { ascending: false })
        .limit(limit),
      "admin audit log",
    );
    res.json(rows);
  }),
);

/**
 * A value for a PostgREST or() filter. Double-quoted so commas, dots and
 * brackets in a clinic's name cannot change the filter; quotes and
 * backslashes, which could end the quoting, are dropped.
 */
function pgrstQuote(v: string): string {
  return `"${v.replace(/["\\]/g, "")}"`;
}

// --- Clinic applications ------------------------------------------------------------

const STATUS_GROUPS: Record<string, string[]> = {
  waiting: ["submitted", "under_review"],
  needs_info: ["needs_info"],
  approved: ["approved"],
  rejected: ["rejected"],
  suspended: ["suspended"],
};

/** The review queue: oldest first, so nobody waits longest by accident. */
admin.get(
  "/applications",
  validate({ query: z.object({ status: z.enum(["waiting", "needs_info", "approved", "rejected", "suspended"]).default("waiting") }) }),
  asyncRoute(async (req, res) => {
    const { status } = req.query as unknown as { status: string };
    const [rows, counts] = await Promise.all([
      dbAdmin
        .from("clinics")
        .select("id, name, city, verification_status, hfr_id, establishment_reg_no, registration_state, submitted_at, reviewed_at, review_note")
        .in("verification_status", STATUS_GROUPS[status] as never)
        .order("submitted_at", { ascending: true, nullsFirst: false })
        .limit(200),
      dbAdmin.from("clinics").select("verification_status"),
    ]);
    const tally: Record<string, number> = {};
    for (const [group, statuses] of Object.entries(STATUS_GROUPS)) {
      tally[group] = unwrap(counts, "clinics").filter((c) => statuses.includes(c.verification_status)).length;
    }
    res.json({ rows: unwrap(rows, "applications"), counts: tally });
  }),
);

/**
 * One application: what was submitted, who applied, their documents (as
 * links valid for two minutes), anything that looks like a duplicate, and
 * the history of decisions. Opening it is recorded — certificates carry
 * personal details.
 */
admin.get(
  "/applications/:id",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const id = req.params.id;
    const clinic = unwrap(await dbAdmin.from("clinics").select("*").eq("id", id).single(), "clinic");

    const [owner, docs, history] = await Promise.all([
      dbAdmin
        .from("clinic_members")
        .select("staff_id, joined_at, staff_profiles!clinic_members_staff_id_fkey(full_name, phone_e164)")
        .eq("clinic_id", id)
        .eq("role", "owner")
        .maybeSingle(),
      dbAdmin
        .from("clinic_documents")
        .select("id, kind, file_name, content_type, size_bytes, uploaded_at, storage_path")
        .eq("clinic_id", id)
        .order("uploaded_at", { ascending: false }),
      dbAdmin
        .from("admin_audit_log")
        .select("id, action, reason, created_at, platform_admins(full_name)")
        .eq("target_type", "clinic")
        .eq("target_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    let ownerEmail: string | null = null;
    if (owner.data?.staff_id) {
      const u = await dbAdmin.auth.admin.getUserById(owner.data.staff_id);
      ownerEmail = u.data.user?.email ?? null;
    }

    const documents = await Promise.all(
      (docs.data ?? []).map(async ({ storage_path, ...d }) => {
        const signed = await dbAdmin.storage.from("clinic-documents").createSignedUrl(storage_path, 120);
        return { ...d, url: signed.data?.signedUrl ?? null };
      }),
    );

    // Possible duplicates the unique constraints cannot catch: the same
    // doctor behind another clinic, or the same name in the same city.
    const dupes = await dbAdmin
      .from("clinics")
      .select("id, name, city, verification_status, owner_reg_no")
      .neq("id", id)
      .or(
        [
          clinic.owner_reg_no ? `owner_reg_no.eq.${pgrstQuote(clinic.owner_reg_no)}` : null,
          `and(name.ilike.${pgrstQuote(clinic.name)},city.ilike.${pgrstQuote(clinic.city)})`,
        ]
          .filter(Boolean)
          .join(","),
      )
      .limit(10);

    await logAdminAction(req, { action: "clinic.view_application", targetType: "clinic", targetId: id });

    res.json({
      clinic,
      owner: owner.data
        ? {
            full_name: (owner.data.staff_profiles as { full_name: string; phone_e164: string | null } | null)?.full_name ?? null,
            phone: (owner.data.staff_profiles as { full_name: string; phone_e164: string | null } | null)?.phone_e164 ?? null,
            email: ownerEmail,
          }
        : null,
      documents,
      possible_duplicates: dupes.data ?? [],
      history: history.data ?? [],
    });
  }),
);

/** Approve, ask for information, reject, suspend or reinstate. */
admin.post(
  "/applications/:id/decision",
  requireAdminRole("reviewer"),
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      decision: z.enum(["start_review", "approve", "needs_info", "reject", "suspend", "reinstate"]),
      note: z.string().trim().max(1000).optional(),
    }),
  }),
  asyncRoute(async (req, res) => {
    const b = req.body as { decision: string; note?: string };
    // The function writes its own audit row in the same transaction.
    const { data, error } = await dbAdmin.rpc("admin_review_clinic", {
      p_clinic_id: req.params.id,
      p_decision: b.decision,
      p_note: b.note ?? "",
      p_admin_id: req.admin!.userId,
      p_request_id: req.id,
    });
    if (error) throw fromPostgrest(error, "recording the decision");
    req.log.info({ clinicId: req.params.id, decision: b.decision }, "clinic review decision");
    res.json(data);
  }),
);
