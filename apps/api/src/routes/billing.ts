import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppError, badRequest, fromPostgrest, notFound, unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";
import { createOrder, razorpayConfig, verifyPaymentSignature } from "../lib/razorpay.js";

export const billing = Router();

/** Plan, trial and payment status for the billing page and the trial banner. */
billing.get(
  "/",
  asyncRoute(async (req, res) => {
    const { db, clinicId } = req.auth!;
    const [plan, sub, payments] = await Promise.all([
      db.from("plans").select("code, name, monthly_price_paise, yearly_price_paise").eq("code", "starter").single(),
      db
        .from("subscriptions")
        .select("id, status, billing_cycle, trial_ends_at, current_period_end")
        .eq("clinic_id", clinicId)
        .in("status", ["trialing", "active", "past_due"])
        .maybeSingle(),
      // RLS returns these to owners and managers only; others get [].
      db
        .from("subscription_payments")
        .select("id, billing_cycle, amount_paise, status, period_start, period_end, paid_at, razorpay_payment_id")
        .eq("clinic_id", clinicId)
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(24),
    ]);

    let paymentsEnabled = true;
    try {
      razorpayConfig();
    } catch {
      paymentsEnabled = false;
    }

    res.json({
      plan: unwrap(plan, "plan"),
      subscription: sub.data,
      payments: payments.data ?? [],
      payments_enabled: paymentsEnabled,
    });
  }),
);

/**
 * Start a payment. Creates a Razorpay order for the plan's price — the amount
 * comes from the plans table, never from the request — and records it.
 */
billing.post(
  "/orders",
  requireRole("owner", "manager"),
  validate({ body: z.object({ cycle: z.enum(["monthly", "yearly"]) }) }),
  asyncRoute(async (req, res) => {
    const cfg = razorpayConfig();
    const { db, clinicId, userId, email } = req.auth!;
    const { cycle } = req.body as { cycle: "monthly" | "yearly" };

    const plan = unwrap(
      await db.from("plans").select("monthly_price_paise, yearly_price_paise, name").eq("code", "starter").single(),
      "plan",
    );
    const amount = cycle === "yearly" ? plan.yearly_price_paise : plan.monthly_price_paise;
    if (!amount) throw badRequest("PLAN_UNAVAILABLE", "That billing period is not available.");

    const sub = unwrap(
      await db
        .from("subscriptions")
        .select("id")
        .eq("clinic_id", clinicId)
        .in("status", ["trialing", "active", "past_due"])
        .single(),
      "subscription",
    );

    const order = await createOrder(cfg, {
      amountPaise: amount,
      receipt: `${clinicId.slice(0, 8)}-${Date.now()}`,
      notes: { clinic_id: clinicId, cycle },
    });

    const { error } = await dbAdmin.from("subscription_payments").insert({
      clinic_id: clinicId,
      subscription_id: sub.id,
      billing_cycle: cycle,
      amount_paise: amount,
      razorpay_order_id: order.id,
      created_by: userId,
    });
    if (error) throw fromPostgrest(error, "recording the order");

    res.status(201).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: cfg.keyId,
      description: `${plan.name} — ${cycle === "yearly" ? "1 year" : "1 month"}`,
      prefill_email: email,
    });
  }),
);

/**
 * Confirm a payment from Checkout's handler. Activates only after the
 * signature verifies and the order is this clinic's own.
 */
billing.post(
  "/verify",
  requireRole("owner", "manager"),
  validate({
    body: z.object({
      razorpay_order_id: z.string().min(5).max(64),
      razorpay_payment_id: z.string().min(5).max(64),
      razorpay_signature: z.string().min(10).max(256),
    }),
  }),
  asyncRoute(async (req, res) => {
    const cfg = razorpayConfig();
    const { clinicId } = req.auth!;
    const b = req.body as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

    if (!verifyPaymentSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature, cfg.keySecret)) {
      req.log.warn({ orderId: b.razorpay_order_id }, "razorpay signature did not verify");
      throw new AppError(400, "PAYMENT_NOT_VERIFIED", "This payment could not be verified. You have not been charged twice — contact us if money left your account.");
    }

    const own = await dbAdmin
      .from("subscription_payments")
      .select("id")
      .eq("razorpay_order_id", b.razorpay_order_id)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!own.data) throw notFound("order");

    const { data, error } = await dbAdmin.rpc("activate_paid_subscription", {
      p_order_id: b.razorpay_order_id,
      p_payment_id: b.razorpay_payment_id,
    });
    if (error) throw fromPostgrest(error, "activating the subscription");
    req.log.info({ orderId: b.razorpay_order_id, paymentId: b.razorpay_payment_id }, "subscription payment verified");
    res.json(data);
  }),
);
