import type { Request, Response } from "express";
import { dbAdmin } from "../lib/supabase.js";
import { razorpayConfig, verifyWebhookSignature } from "../lib/razorpay.js";

type Entity = { id?: string; order_id?: string; payment_id?: string; amount?: number; status?: string };
type Event = {
  event?: string;
  payload?: { payment?: { entity?: Entity }; refund?: { entity?: Entity }; dispute?: { entity?: Entity } };
};

/**
 * Razorpay webhooks: payment.captured, payment.failed, refund.processed,
 * refund.failed and payment.dispute.*. Every request is stored in payment_events — unverified
 * ones too, without their body, because a run of them is worth knowing
 * about. Each event is acted on once: Razorpay's event id is unique.
 *
 * Mounted with express.raw: the signature covers the exact bytes sent.
 */
export async function razorpayWebhook(req: Request, res: Response) {
  let cfg;
  try {
    cfg = razorpayConfig();
  } catch {
    res.status(503).json({ ok: false });
    return;
  }

  const raw = req.body as Buffer;
  const signature = req.header("x-razorpay-signature") ?? "";
  const eventId = req.header("x-razorpay-event-id") ?? null;
  const verified = !!cfg.webhookSecret && Buffer.isBuffer(raw) && verifyWebhookSignature(raw, signature, cfg.webhookSecret);

  if (!verified) {
    req.log.warn("razorpay webhook signature did not verify");
    await dbAdmin.from("payment_events").insert({ signature_ok: false, event_type: null, outcome: "rejected: bad signature" });
    res.status(400).json({ ok: false });
    return;
  }

  let event: Event;
  try {
    event = JSON.parse(raw.toString("utf8")) as Event;
  } catch {
    res.status(400).json({ ok: false });
    return;
  }
  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;
  const dispute = event.payload?.dispute?.entity;

  const outcome = await handle(event.event ?? "", payment, refund, dispute, req);

  const { error } = await dbAdmin.from("payment_events").insert({
    provider_event_id: eventId,
    event_type: event.event ?? null,
    signature_ok: true,
    razorpay_payment_id: payment?.id ?? refund?.payment_id ?? dispute?.payment_id ?? null,
    razorpay_order_id: payment?.order_id ?? null,
    razorpay_refund_id: refund?.id ?? null,
    amount_paise: payment?.amount ?? refund?.amount ?? dispute?.amount ?? null,
    payload: event as never,
    outcome,
  });
  if (error?.code === "23505") {
    // Already stored: Razorpay retried an event we handled. Acting again is
    // harmless (everything above is idempotent), and this says so.
    res.json({ ok: true, replay: true });
    return;
  }
  if (outcome.startsWith("error")) {
    res.status(500).json({ ok: false }); // Razorpay retries
    return;
  }
  res.json({ ok: true, outcome });
}

async function handle(type: string, payment?: Entity, refund?: Entity, dispute?: Entity, req?: Request): Promise<string> {
  if (type === "payment.captured" && payment?.id && payment.order_id) {
    const { data, error } = await dbAdmin.rpc("activate_paid_subscription", {
      p_order_id: payment.order_id,
      p_payment_id: payment.id,
      p_captured_paise: payment.amount ?? -1,
    });
    if (error?.code === "P0002") return "ignored: not a subscription order";
    if (error) {
      req?.log.error({ err: error, orderId: payment.order_id }, "webhook activation failed");
      return "error: activation failed";
    }
    return data?.status === "paid" ? "activated" : "held: amount mismatch";
  }

  if (type === "payment.failed" && payment?.order_id) {
    // Only an order still waiting is marked failed: Checkout lets the clinic
    // retry on the same order, and a later capture still activates it. The
    // owner is emailed once per order (see the notifications trigger).
    const { data } = await dbAdmin
      .from("subscription_payments")
      .update({ status: "failed" })
      .eq("razorpay_order_id", payment.order_id)
      .eq("status", "created")
      .select("id");
    return data?.length ? "marked failed" : "ignored: not waiting";
  }

  if ((type === "refund.processed" || type === "refund.failed") && refund?.id) {
    const status = type === "refund.processed" ? "processed" : "failed";
    await dbAdmin
      .from("refunds")
      .update({ status, processed_at: status === "processed" ? new Date().toISOString() : null })
      .eq("razorpay_refund_id", refund.id);
    if (status === "failed") {
      await dbAdmin.rpc("record_payment_exception", {
        p_kind: "refund_failed",
        p_payment_id: null as never,
        p_rzp_payment: refund.payment_id ?? null as never,
        p_rzp_order: null as never,
        p_amount: refund.amount ?? null as never,
        p_details: { refund_id: refund.id },
      });
    }
    return `refund ${status}`;
  }

  if (type.startsWith("payment.dispute.") && dispute?.payment_id) {
    const { data: pay } = await dbAdmin
      .from("subscription_payments")
      .select("id, razorpay_order_id")
      .eq("razorpay_payment_id", dispute.payment_id)
      .maybeSingle();
    await dbAdmin.rpc("record_payment_exception", {
      p_kind: "dispute",
      p_payment_id: (pay?.id ?? null) as never,
      p_rzp_payment: dispute.payment_id,
      p_rzp_order: (pay?.razorpay_order_id ?? null) as never,
      p_amount: (dispute.amount ?? null) as never,
      p_details: { event: type, dispute_id: dispute.id ?? null, status: dispute.status ?? null },
    });
    return `dispute recorded (${type})`;
  }

  return "stored";
}
