import { dbAdmin } from "./supabase.js";
import { fetchOrderPayments, razorpayConfig, type RazorpayConfig } from "./razorpay.js";

export type ReconcileSummary = { checked: number; activated: number; held: number; authorized: number; expired: number; errors: number };

/**
 * Compare every unfinished order with Razorpay.
 *
 * - captured there but not here → activate it (the clinic paid and closed the
 *   tab, and the webhook never arrived), logged as a payment event
 * - authorized but not captured → an exception for an admin
 * - nothing paid after 24 hours → expired, so it stops cluttering the ledger
 *
 * Orders younger than 15 minutes are left alone: the clinic may still be on
 * the Checkout screen. Safe to run any number of times.
 */
export async function reconcile(cfg: RazorpayConfig = razorpayConfig(), now: Date = new Date()): Promise<ReconcileSummary> {
  const s: ReconcileSummary = { checked: 0, activated: 0, held: 0, authorized: 0, expired: 0, errors: 0 };
  const { data: orders } = await dbAdmin
    .from("subscription_payments")
    .select("id, razorpay_order_id, created_at")
    .eq("status", "created")
    .lt("created_at", new Date(now.getTime() - 15 * 60_000).toISOString())
    .gt("created_at", new Date(now.getTime() - 7 * 86_400_000).toISOString())
    .limit(200);

  for (const o of orders ?? []) {
    s.checked += 1;
    try {
      const attempts = await fetchOrderPayments(cfg, o.razorpay_order_id);
      const captured = attempts.find((p) => p.status === "captured");
      const authorized = attempts.find((p) => p.status === "authorized");

      if (captured) {
        const { data } = await dbAdmin.rpc("activate_paid_subscription", {
          p_order_id: o.razorpay_order_id,
          p_payment_id: captured.id,
          p_captured_paise: captured.amount,
        });
        const ok = data?.status === "paid";
        if (ok) s.activated += 1;
        else s.held += 1;
        await dbAdmin.from("payment_events").insert({
          event_type: "reconcile.captured",
          signature_ok: true, // our own authenticated call to Razorpay
          razorpay_payment_id: captured.id,
          razorpay_order_id: o.razorpay_order_id,
          amount_paise: captured.amount,
          payload: {},
          outcome: ok ? "activated by reconciliation" : "held: amount mismatch",
        });
      } else if (authorized) {
        s.authorized += 1;
        await dbAdmin.rpc("record_payment_exception", {
          p_kind: "authorized_not_captured",
          p_payment_id: o.id,
          p_rzp_payment: authorized.id,
          p_rzp_order: o.razorpay_order_id,
          p_amount: authorized.amount,
          p_details: { found_by: "reconciliation" },
        });
      } else if (new Date(o.created_at).getTime() < now.getTime() - 86_400_000) {
        s.expired += 1;
        await dbAdmin.from("subscription_payments").update({ status: "expired" }).eq("id", o.id).eq("status", "created");
      }
    } catch {
      s.errors += 1;
    }
  }
  return s;
}
