import type { Request, Response } from "express";
import { dbAdmin } from "../lib/supabase.js";
import { razorpayConfig, verifyWebhookSignature } from "../lib/razorpay.js";

/**
 * Razorpay's payment.captured webhook — the backstop for a clinic that paid
 * and then closed the tab before Checkout's handler reported back.
 *
 * Mounted with express.raw: the signature covers the exact bytes Razorpay
 * sent, which re-serialised JSON would not match. Activation is idempotent,
 * so this and the browser's verify call can both arrive.
 */
export async function razorpayWebhook(req: Request, res: Response) {
  let cfg;
  try {
    cfg = razorpayConfig();
  } catch {
    res.status(503).json({ ok: false });
    return;
  }
  const signature = req.header("x-razorpay-signature") ?? "";
  const raw = req.body as Buffer;
  if (!cfg.webhookSecret || !Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, signature, cfg.webhookSecret)) {
    req.log.warn("razorpay webhook signature did not verify");
    res.status(400).json({ ok: false });
    return;
  }

  const event = JSON.parse(raw.toString("utf8")) as {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  const payment = event.payload?.payment?.entity;
  if (event.event !== "payment.captured" || !payment?.id || !payment.order_id) {
    res.json({ ok: true, ignored: true });
    return;
  }

  const { error } = await dbAdmin.rpc("activate_paid_subscription", {
    p_order_id: payment.order_id,
    p_payment_id: payment.id,
  });
  if (error?.code === "P0002") {
    // Not one of our subscription orders. Acknowledge so Razorpay stops retrying.
    res.json({ ok: true, ignored: true });
    return;
  }
  if (error) {
    req.log.error({ err: error, orderId: payment.order_id }, "webhook activation failed");
    res.status(500).json({ ok: false }); // Razorpay retries
    return;
  }
  res.json({ ok: true });
}
