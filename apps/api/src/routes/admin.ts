import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { uuid, validate } from "../middleware/validate.js";
import { requireAdminRole } from "../middleware/admin.js";
import { AppError, fromPostgrest, unwrap } from "../lib/errors.js";
import { createRefund, fetchPayment, razorpayConfig } from "../lib/razorpay.js";
import { reconcile } from "../lib/reconcile.js";
import { health } from "../lib/health.js";
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
    res.json({ user_id: a.userId, email: a.email, role: a.role, full_name: a.fullName });
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
    const [clinics, subs, payments, plan, exceptions, queue, ledgerMonth] = await Promise.all([
      dbAdmin.from("clinics").select("created_at"),
      dbAdmin.from("subscriptions").select("clinic_id, status, billing_cycle, current_period_end, trial_ends_at"),
      dbAdmin.from("subscription_payments").select("amount_paise, paid_at, status"),
      dbAdmin.from("plans").select("monthly_price_paise, yearly_price_paise").eq("code", "starter").single(),
      dbAdmin.from("payment_exceptions").select("id", { count: "exact", head: true }).eq("status", "open"),
      dbAdmin.from("clinics").select("id", { count: "exact", head: true }).in("verification_status", ["submitted", "under_review"]),
      dbAdmin.rpc("admin_monthly_metrics", { p_months: 1 }),
    ]);
    const approvals = await dbAdmin.from("refund_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    // MRR from the payment ledger, as Analytics computes it: what has
    // actually been paid for, not what subscriptions claim. A seeded or
    // comped "active" subscription with no payment is not revenue.
    const ledger = (ledgerMonth.data ?? [])[0];
    const mrrPaise = Number(ledger?.mrr_paise ?? 0);
    res.json({
      ...overview({
        clinics: unwrap(clinics, "clinics"),
        subs: unwrap(subs, "subscriptions"),
        payments: unwrap(payments, "payments"),
        price: unwrap(plan, "plan"),
      }),
      mrrPaise,
      arrPaise: mrrPaise * 12,
      payingFromLedger: Number(ledger?.paying_clinics ?? 0),
      openPaymentExceptions: exceptions.count ?? 0,
      applicationsWaiting: queue.count ?? 0,
      refundApprovalsWaiting: approvals.count ?? 0,
    });
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

// --- Clinics ----------------------------------------------------------------------------

/** Every clinic, with subscription and 30-day activity — counts, never patients. */
admin.get(
  "/clinics",
  asyncRoute(async (_req, res) => {
    const { data, error } = await dbAdmin.rpc("admin_clinic_summaries");
    if (error) throw fromPostgrest(error, "loading clinics");
    res.json(data ?? []);
  }),
);

/**
 * One clinic, everything an operator needs: profile and verification,
 * subscription and payments, staff, 30-day usage and patient figures (counts
 * only), notes and history. Opening it is recorded: it shows staff contacts.
 */
admin.get(
  "/clinics/:id",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const id = req.params.id;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const clinic = unwrap(await dbAdmin.from("clinics").select("*").eq("id", id).single(), "clinic");

    const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
    const head = { count: "exact" as const, head: true };

    const [subs, payments, staff, notes, history, appts, live] = await Promise.all([
      dbAdmin.from("subscriptions").select("id, plan_code, status, billing_cycle, trial_ends_at, current_period_start, current_period_end, created_at").eq("clinic_id", id).order("created_at", { ascending: false }),
      dbAdmin.from("subscription_payments").select("id, billing_cycle, amount_paise, status, razorpay_order_id, razorpay_payment_id, period_start, period_end, created_at, paid_at").eq("clinic_id", id).order("created_at", { ascending: false }).limit(50),
      dbAdmin.from("clinic_members").select("role, status, joined_at, staff_profiles!clinic_members_staff_id_fkey(full_name, phone_e164)").eq("clinic_id", id),
      dbAdmin.from("admin_clinic_notes").select("id, body, created_at, platform_admins(full_name)").eq("clinic_id", id).order("created_at", { ascending: false }).limit(50),
      dbAdmin.from("admin_audit_log").select("id, action, reason, created_at, platform_admins(full_name)").eq("target_type", "clinic").eq("target_id", id).order("created_at", { ascending: false }).limit(50),
      dbAdmin.from("appointments").select("source, status").eq("clinic_id", id).gte("created_at", since),
      dbAdmin.rpc("admin_clinic_summaries"),
    ]);
    const [emails, grants, invoices] = await Promise.all([
      dbAdmin.from("notifications").select("id, kind, to_email, status, attempts, last_error, created_at, sent_at").eq("clinic_id", id).eq("audience", "clinic").order("created_at", { ascending: false }).limit(20),
      dbAdmin.from("support_access_grants").select("id, reason, created_at, expires_at, revoked_at").eq("clinic_id", id).order("created_at", { ascending: false }).limit(5),
      dbAdmin.from("invoices").select("id, kind, number, payment_id, total_paise, issued_at").eq("clinic_id", id).order("issued_at", { ascending: false }).limit(50),
    ]);
    const now = Date.now();
    const activeGrant = (grants.data ?? []).find((g) => !g.revoked_at && new Date(g.expires_at).getTime() > now) ?? null;

    const rows = appts.data ?? [];
    const bySource: Record<string, number> = {};
    for (const r of rows) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    const completed = rows.filter((r) => r.status === "completed").length;
    const noShows = rows.filter((r) => r.status === "no_show").length;

    const [patients, newPatients, calls, escalated, openActions, links] = await Promise.all([
      count(dbAdmin.from("patients").select("id", head).eq("clinic_id", id)),
      count(dbAdmin.from("patients").select("id", head).eq("clinic_id", id).gte("created_at", since)),
      count(dbAdmin.from("calls").select("id", head).eq("clinic_id", id).gte("started_at", since)),
      count(dbAdmin.from("calls").select("id", head).eq("clinic_id", id).gte("started_at", since).eq("escalated_to_human", true)),
      count(dbAdmin.from("action_items").select("id", head).eq("clinic_id", id).in("status", ["open", "in_progress"])),
      count(dbAdmin.from("patient_access_tokens").select("id", head).eq("clinic_id", id).gte("created_at", since)),
    ]);

    await logAdminAction(req, { action: "clinic.view", targetType: "clinic", targetId: id });

    res.json({
      clinic,
      is_live: (live.data ?? []).find((r: { id: string; is_live: boolean }) => r.id === id)?.is_live ?? false,
      subscriptions: subs.data ?? [],
      payments: payments.data ?? [],
      staff: (staff.data ?? []).map((m) => ({
        role: m.role,
        status: m.status,
        joined_at: m.joined_at,
        full_name: (m.staff_profiles as { full_name: string } | null)?.full_name ?? null,
        phone: (m.staff_profiles as { phone_e164: string | null } | null)?.phone_e164 ?? null,
      })),
      usage: {
        appointments_30d: rows.length,
        by_source: bySource,
        no_show_rate: completed + noShows > 0 ? Math.round((noShows / (completed + noShows)) * 100) : null,
        calls_30d: calls,
        escalated_30d: escalated,
        open_actions: openActions,
        portal_links_30d: links,
      },
      patients: { total: patients, new_30d: newPatients },
      notes: notes.data ?? [],
      history: history.data ?? [],
      emails: emails.data ?? [],
      invoices: invoices.data ?? [],
      support_access: activeGrant,
    });
  }),
);

/** Extend a trial or a paid period, with a reason. Finance only. */
admin.post(
  "/clinics/:id/subscription",
  requireAdminRole("finance"),
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      action: z.enum(["extend_trial", "extend_period"]),
      days: z.number().int().min(1).max(90),
      note: z.string().trim().min(1).max(1000),
    }),
  }),
  asyncRoute(async (req, res) => {
    const b = req.body as { action: string; days: number; note: string };
    const { data, error } = await dbAdmin.rpc("admin_adjust_subscription", {
      p_clinic_id: req.params.id,
      p_action: b.action,
      p_days: b.days,
      p_note: b.note,
      p_admin_id: req.admin!.userId,
      p_request_id: req.id,
    });
    if (error) throw fromPostgrest(error, "adjusting the subscription");
    res.json(data);
  }),
);

/** A note on a clinic, for whoever looks next. */
admin.post(
  "/clinics/:id/notes",
  requireAdminRole("support", "reviewer", "finance"),
  validate({ params: z.object({ id: uuid }), body: z.object({ body: z.string().trim().min(1).max(2000) }) }),
  asyncRoute(async (req, res) => {
    const note = unwrap(
      await dbAdmin
        .from("admin_clinic_notes")
        .insert({ clinic_id: req.params.id, admin_user_id: req.admin!.userId, body: (req.body as { body: string }).body })
        .select("id, body, created_at")
        .single(),
      "note",
    );
    await logAdminAction(req, { action: "clinic.note", targetType: "clinic", targetId: req.params.id });
    res.status(201).json(note);
  }),
);

// --- Payments ----------------------------------------------------------------------------

/** Every payment and order, newest first, with the clinic's name. */
admin.get(
  "/payments",
  validate({ query: z.object({ status: z.enum(["all", "paid", "created", "expired", "failed"]).default("all") }) }),
  asyncRoute(async (req, res) => {
    const { status } = req.query as unknown as { status: string };
    let q = dbAdmin
      .from("subscription_payments")
      .select("id, clinic_id, billing_cycle, amount_paise, captured_paise, refunded_paise, status, razorpay_order_id, razorpay_payment_id, period_start, period_end, created_at, paid_at, clinics(name, city)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (status !== "all") q = q.eq("status", status);
    const rows = unwrap(await q, "payments");
    const paid = rows.filter((r) => r.status === "paid").map((r) => r.id);
    const inv = paid.length
      ? (await dbAdmin.from("invoices").select("id, payment_id").eq("kind", "invoice").in("payment_id", paid)).data ?? []
      : [];
    const invoiceOf = new Map(inv.map((i) => [i.payment_id, i.id]));
    res.json(rows.map((r) => ({ ...r, invoice_id: invoiceOf.get(r.id) ?? null })));
  }),
);

admin.get(
  "/payments/exceptions",
  validate({ query: z.object({ status: z.enum(["open", "resolved", "dismissed"]).default("open") }) }),
  asyncRoute(async (req, res) => {
    const { status } = req.query as unknown as { status: string };
    const rows = unwrap(
      await dbAdmin
        .from("payment_exceptions")
        .select("*, clinics(name), platform_admins(full_name)")
        .eq("status", status)
        .order("detected_at", { ascending: status === "open" })
        .limit(200),
      "payment exceptions",
    );
    res.json(rows);
  }),
);

/**
 * Close an exception. "activate" first asks Razorpay what was captured and
 * activates with that amount — the same rule as everywhere else, so an
 * admin cannot activate money that did not arrive.
 */
admin.post(
  "/payments/exceptions/:id/resolve",
  requireAdminRole("finance"),
  validate({
    params: z.object({ id: uuid }),
    body: z.object({ action: z.enum(["activate", "resolved", "dismissed"]), note: z.string().trim().min(3).max(1000) }),
  }),
  asyncRoute(async (req, res) => {
    const b = req.body as { action: "activate" | "resolved" | "dismissed"; note: string };
    const ex = unwrap(await dbAdmin.from("payment_exceptions").select("*").eq("id", req.params.id).single(), "exception");

    if (b.action === "activate") {
      if (!ex.razorpay_payment_id || !ex.razorpay_order_id) {
        throw new AppError(400, "NOTHING_TO_ACTIVATE", "This exception has no payment to activate.");
      }
      const payment = await fetchPayment(razorpayConfig(), ex.razorpay_payment_id);
      if (payment.status !== "captured") {
        throw new AppError(409, "NOT_CAPTURED", `Razorpay says this payment is ${payment.status}, not captured.`);
      }
      // A mismatch the admin has accepted: activate against what was paid.
      await dbAdmin.from("subscription_payments").update({ amount_paise: payment.amount }).eq("razorpay_order_id", ex.razorpay_order_id).eq("status", "created");
      const { data, error } = await dbAdmin.rpc("activate_paid_subscription", {
        p_order_id: ex.razorpay_order_id,
        p_payment_id: payment.id,
        p_captured_paise: payment.amount,
      });
      if (error) throw fromPostgrest(error, "activating");
      if (data?.status !== "paid") throw new AppError(409, "NOT_ACTIVATED", "The payment could not be activated.");
    }

    const { data, error } = await dbAdmin.rpc("admin_resolve_payment_exception", {
      p_exception_id: req.params.id,
      p_status: b.action === "dismissed" ? "dismissed" : "resolved",
      p_resolution: b.action === "activate" ? `Activated after checking Razorpay. ${b.note}` : b.note,
      p_admin_id: req.admin!.userId,
      p_request_id: req.id,
    });
    if (error) throw fromPostgrest(error, "resolving the exception");
    res.json(data);
  }),
);

/**
 * Refund through Razorpay, then record it. Razorpay first: if it refuses,
 * nothing is recorded. Optionally take back the unused part of the period.
 */
admin.post(
  "/payments/:id/refund",
  requireAdminRole("finance"),
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      amount_paise: z.number().int().positive(),
      revoke_period: z.boolean(),
      reason: z.string().trim().min(3).max(1000),
    }),
  }),
  asyncRoute(async (req, res) => {
    const b = req.body as { amount_paise: number; revoke_period: boolean; reason: string };
    const pay = unwrap(
      await dbAdmin.from("subscription_payments").select("id, status, razorpay_payment_id, amount_paise, captured_paise, refunded_paise").eq("id", req.params.id).single(),
      "payment",
    );
    if (pay.status !== "paid" || !pay.razorpay_payment_id) throw new AppError(409, "NOT_PAID", "Only a paid payment can be refunded.");
    const left = (pay.captured_paise ?? pay.amount_paise) - pay.refunded_paise;
    if (b.amount_paise > left) throw new AppError(409, "TOO_MUCH", `At most ${left / 100} rupees is left to refund.`);

    // Above the threshold a second admin must approve: ask, do not refund.
    const settings = unwrap(await dbAdmin.from("platform_settings").select("refund_second_approval_paise").single(), "settings");
    if (b.amount_paise > settings.refund_second_approval_paise) {
      const { data, error } = await dbAdmin.rpc("admin_request_refund", {
        p_payment_id: pay.id,
        p_amount: b.amount_paise,
        p_revoke_period: b.revoke_period,
        p_reason: b.reason,
        p_admin_id: req.admin!.userId,
        p_request_id: req.id,
      });
      if (error) {
        if (error.code === "23505") throw new AppError(409, "ALREADY_REQUESTED", "A refund for this payment is already waiting for approval.");
        throw fromPostgrest(error, "requesting the refund");
      }
      res.status(202).json({ needs_approval: true, request: data });
      return;
    }

    const refund = await createRefund(razorpayConfig(), pay.razorpay_payment_id, b.amount_paise, {
      reason: b.reason.slice(0, 250),
      by: req.admin!.email ?? req.admin!.userId,
    });

    const { data, error } = await dbAdmin.rpc("admin_record_refund", {
      p_payment_id: pay.id,
      p_razorpay_refund_id: refund.id,
      p_amount: refund.amount,
      p_status: refund.status === "processed" ? "processed" : "processing",
      p_revoke_period: b.revoke_period,
      p_reason: b.reason,
      p_admin_id: req.admin!.userId,
      p_request_id: req.id,
    });
    if (error) {
      // Razorpay has the refund; our record failed. Say so loudly — it must
      // be recorded by hand, not retried (that would refund twice).
      req.log.error({ err: error, refundId: refund.id }, "refund issued at Razorpay but not recorded");
      throw new AppError(500, "REFUND_NOT_RECORDED", `Razorpay issued refund ${refund.id}, but SAHVA could not record it. Do not retry — record it by hand.`);
    }
    res.status(201).json(data);
  }),
);

admin.get(
  "/payments/events",
  asyncRoute(async (_req, res) => {
    const rows = unwrap(
      await dbAdmin
        .from("payment_events")
        .select("id, event_type, signature_ok, razorpay_payment_id, razorpay_order_id, razorpay_refund_id, amount_paise, outcome, received_at")
        .order("received_at", { ascending: false })
        .limit(200),
      "payment events",
    );
    res.json(rows);
  }),
);

admin.post(
  "/payments/reconcile",
  requireAdminRole("finance"),
  asyncRoute(async (req, res) => {
    const summary = await reconcile();
    await logAdminAction(req, { action: "payment.reconcile", after: summary });
    res.json(summary);
  }),
);

// --- Two-person refunds ------------------------------------------------------------------------

admin.get(
  "/payments/refund-requests",
  asyncRoute(async (_req, res) => {
    const rows = unwrap(
      await dbAdmin
        .from("refund_requests")
        .select("*, clinics(name), subscription_payments(razorpay_payment_id, billing_cycle, amount_paise), requester:platform_admins!refund_requests_requested_by_fkey(full_name), decider:platform_admins!refund_requests_decided_by_fkey(full_name)")
        .order("requested_at", { ascending: false })
        .limit(100),
      "refund requests",
    );
    res.json(rows);
  }),
);

/**
 * Approve: claim the request (so a second approver cannot also refund it),
 * refund through Razorpay, record it. If Razorpay refuses, the claim is
 * released and nothing changed.
 */
admin.post(
  "/payments/refund-requests/:id/approve",
  requireAdminRole("finance"),
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    const claim = await dbAdmin.rpc("admin_decide_refund_request", {
      p_request: req.params.id,
      p_action: "claim",
      p_note: null as never,
      p_admin_id: req.admin!.userId,
      p_request_id: req.id,
    });
    if (claim.error) throw fromPostgrest(claim.error, "approving the refund");
    const r = claim.data!;
    const pay = unwrap(await dbAdmin.from("subscription_payments").select("razorpay_payment_id").eq("id", r.payment_id).single(), "payment");

    let refund;
    try {
      refund = await createRefund(razorpayConfig(), pay.razorpay_payment_id!, r.amount_paise, {
        reason: r.reason.slice(0, 250),
        by: req.admin!.email ?? req.admin!.userId,
      });
    } catch (e) {
      await dbAdmin.rpc("admin_decide_refund_request", {
        p_request: r.id, p_action: "release", p_note: null as never, p_admin_id: req.admin!.userId, p_request_id: req.id,
      });
      throw e;
    }

    const { data, error } = await dbAdmin.rpc("admin_record_refund", {
      p_payment_id: r.payment_id,
      p_razorpay_refund_id: refund.id,
      p_amount: refund.amount,
      p_status: refund.status === "processed" ? "processed" : "processing",
      p_revoke_period: r.revoke_period,
      p_reason: r.reason,
      p_admin_id: req.admin!.userId,
      p_request_id: req.id,
      p_refund_request: r.id,
    });
    if (error) {
      req.log.error({ err: error, refundId: refund.id }, "approved refund issued at Razorpay but not recorded");
      throw new AppError(500, "REFUND_NOT_RECORDED", `Razorpay issued refund ${refund.id}, but SAHVA could not record it. Do not retry — record it by hand.`);
    }
    res.status(201).json(data);
  }),
);

admin.post(
  "/payments/refund-requests/:id/:action(decline|cancel)",
  requireAdminRole("finance"),
  validate({ params: z.object({ id: uuid, action: z.enum(["decline", "cancel"]) }), body: z.object({ note: z.string().trim().max(1000).default("") }) }),
  asyncRoute(async (req, res) => {
    const { data, error } = await dbAdmin.rpc("admin_decide_refund_request", {
      p_request: req.params.id,
      p_action: req.params.action,
      p_note: (req.body as { note: string }).note,
      p_admin_id: req.admin!.userId,
      p_request_id: req.id,
    });
    if (error) throw fromPostgrest(error, "updating the refund request");
    res.json(data);
  }),
);

// --- Invoices and settings ----------------------------------------------------------------------

admin.get(
  "/invoices/:id",
  validate({ params: z.object({ id: uuid }) }),
  asyncRoute(async (req, res) => {
    res.json(unwrap(await dbAdmin.from("invoices").select("*").eq("id", req.params.id).single(), "invoice"));
  }),
);

admin.get(
  "/settings",
  asyncRoute(async (_req, res) => {
    const [settings, ready] = await Promise.all([
      dbAdmin.from("platform_settings").select("*").single(),
      dbAdmin.from("invoices").select("id", { count: "exact", head: true }),
    ]);
    const s = unwrap(settings, "settings");
    res.json({ ...s, invoicing_ready: s.legal_name.trim().length >= 3 && s.address.trim().length >= 10, invoices_issued: ready.count ?? 0 });
  }),
);

const gstin = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
admin.put(
  "/settings",
  requireAdminRole("super_admin"),
  validate({
    body: z
      .object({
        legal_name: z.string().trim().min(3).max(200),
        address: z.string().trim().min(10).max(500),
        state: z.string().trim().min(2).max(60),
        state_code: z.string().regex(/^[0-9]{2}$/),
        gstin: z.union([z.literal(""), z.string().trim().toUpperCase().regex(gstin, "GSTIN format")]),
        pan: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN format")]),
        email: z.union([z.literal(""), z.string().email()]),
        phone: z.string().trim().max(20),
        sac_code: z.string().regex(/^[0-9]{6}$/),
        gst_rate_bps: z.number().int().min(0).max(2800),
        refund_second_approval_paise: z.number().int().min(0),
      })
      .partial(),
  }),
  asyncRoute(async (req, res) => {
    const { data, error } = await dbAdmin.rpc("admin_update_platform_settings", {
      p_changes: req.body,
      p_admin_id: req.admin!.userId,
      p_request_id: req.id,
    });
    if (error) throw fromPostgrest(error, "saving settings");
    res.json(data);
  }),
);

// --- Support access (opened by the clinic) -----------------------------------------------------

/**
 * Find a patient while the clinic has support access open. Support and super
 * admins only; the search itself is audited, before any name is returned.
 */
admin.get(
  "/clinics/:id/support/patients",
  requireAdminRole("support"),
  validate({ params: z.object({ id: uuid }), query: z.object({ q: z.string().trim().min(2).max(60) }) }),
  asyncRoute(async (req, res) => {
    const { q } = req.query as unknown as { q: string };
    const grant = await dbAdmin.rpc("admin_log_support_access", {
      p_admin_id: req.admin!.userId, p_clinic: req.params.id, p_patient: null as never, p_query: q, p_request_id: req.id,
    });
    if (grant.error) throw fromPostgrest(grant.error, "support access");
    const digits = q.replace(/\D/g, "");
    const rows = unwrap(
      await dbAdmin
        .from("patients")
        .select("id, full_name, phone_e164")
        .eq("clinic_id", req.params.id)
        .or(digits.length >= 4 ? `phone_e164.like.*${digits}*` : `full_name.ilike.*${q.replace(/[,()*%]/g, "")}*`)
        .limit(20),
      "patients",
    );
    res.json(rows);
  }),
);

/** One patient's profile and appointments — never medical records. Logged where the owner sees it. */
admin.get(
  "/clinics/:id/support/patients/:patientId",
  requireAdminRole("support"),
  validate({ params: z.object({ id: uuid, patientId: uuid }) }),
  asyncRoute(async (req, res) => {
    const grant = await dbAdmin.rpc("admin_log_support_access", {
      p_admin_id: req.admin!.userId, p_clinic: req.params.id, p_patient: req.params.patientId, p_query: null as never, p_request_id: req.id,
    });
    if (grant.error) throw fromPostgrest(grant.error, "support access");
    const [patient, appts] = await Promise.all([
      dbAdmin
        .from("patients")
        .select("id, full_name, phone_e164, sex, date_of_birth, preferred_language, created_at")
        .eq("id", req.params.patientId)
        .eq("clinic_id", req.params.id)
        .single(),
      dbAdmin
        .from("appointments")
        .select("id, starts_at, status, source, token_number, doctors(full_name)")
        .eq("patient_id", req.params.patientId)
        .eq("clinic_id", req.params.id)
        .order("starts_at", { ascending: false })
        .limit(20),
    ]);
    res.json({ ...unwrap(patient, "patient"), appointments: appts.data ?? [], grant: grant.data });
  }),
);

// --- Security -----------------------------------------------------------------------------------

/**
 * Refused requests and staff role changes. Counts by kind and by address for
 * the period, and the latest events. Addresses and paths only — no bodies.
 */
admin.get(
  "/security",
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) }),
  asyncRoute(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = unwrap(
      await dbAdmin
        .from("security_events")
        .select("id, kind, actor_user_id, clinic_id, ip, method, path, details, created_at, clinics(name)")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
      "security events",
    );
    const byKind: Record<string, number> = {};
    const byIp = new Map<string, number>();
    for (const r of rows) {
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      if (r.ip && r.kind !== "role_changed" && r.kind !== "member_added" && r.kind !== "member_removed") byIp.set(r.ip, (byIp.get(r.ip) ?? 0) + 1);
    }
    res.json({
      days,
      by_kind: byKind,
      top_addresses: [...byIp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count })),
      events: rows.slice(0, 200),
      truncated: rows.length === 2000,
    });
  }),
);

// --- Analytics -------------------------------------------------------------------------------

/** Months of growth, money and platform-wide activity, plus every clinic's health. */
admin.get(
  "/analytics",
  validate({ query: z.object({ months: z.coerce.number().int().min(3).max(24).default(6) }) }),
  asyncRoute(async (req, res) => {
    const { months } = req.query as unknown as { months: number };
    const [series, signals] = await Promise.all([
      dbAdmin.rpc("admin_monthly_metrics", { p_months: months }),
      dbAdmin.rpc("admin_clinic_signals"),
    ]);
    if (series.error) throw fromPostgrest(series.error, "loading metrics");
    if (signals.error) throw fromPostgrest(signals.error, "loading clinic signals");
    const now = new Date();
    const clinics = (signals.data ?? [])
      .map((s) => ({ id: s.id, name: s.name, city: s.city, health: health(s, now) }))
      .filter((c) => c.health !== null)
      .sort((a, b) => a.health!.score - b.health!.score);
    res.json({ months: series.data ?? [], clinics });
  }),
);
