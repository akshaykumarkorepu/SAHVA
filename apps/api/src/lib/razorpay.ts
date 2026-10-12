import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

/**
 * Razorpay, kept to the three things billing needs: create an order, check
 * the signature Checkout returns, and check a webhook's signature.
 *
 * A payment counts only when one of the two signatures verifies. The browser
 * saying "it worked" is never enough on its own.
 */

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret?: string };

/** The configured keys, or a clear refusal. Live keys only in production. */
export function razorpayConfig(nodeEnv = env.NODE_ENV): RazorpayConfig {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new AppError(503, "PAYMENTS_NOT_CONFIGURED", "Online payment is not set up yet.");
  }
  if (keyId.startsWith("rzp_live_") && nodeEnv !== "production") {
    throw new AppError(503, "LIVE_KEYS_REFUSED", "Live Razorpay keys are refused outside production.");
  }
  return { keyId, keySecret, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET };
}

function safeEqualHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout's handler signature: HMAC-SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256 of the raw request body, webhook secret. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

export type RazorpayOrder = { id: string; amount: number; currency: string; receipt: string };

export async function createOrder(
  cfg: RazorpayConfig,
  order: { amountPaise: number; receipt: string; notes: Record<string, string> },
  fetchImpl: typeof fetch = fetch,
): Promise<RazorpayOrder> {
  const res = await fetchImpl("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ amount: order.amountPaise, currency: "INR", receipt: order.receipt, notes: order.notes }),
  });
  const body = (await res.json().catch(() => null)) as (RazorpayOrder & { error?: { description?: string } }) | null;
  if (!res.ok || !body?.id) {
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "Could not start the payment. Please try again.", body?.error?.description);
  }
  return body;
}

export type RazorpayPayment = { id: string; order_id: string; status: string; amount: number; captured: boolean };
export type RazorpayRefund = { id: string; amount: number; status: string };

async function rzp<T>(cfg: RazorpayConfig, path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
    },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: { description?: string } }) | null;
  if (!res.ok || !body) {
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "Razorpay did not answer as expected.", body?.error?.description);
  }
  return body;
}

/** A payment as Razorpay holds it — the truth about whether money moved. */
export const fetchPayment = (cfg: RazorpayConfig, paymentId: string, fetchImpl: typeof fetch = fetch) =>
  rzp<RazorpayPayment>(cfg, `/payments/${encodeURIComponent(paymentId)}`, { method: "GET" }, fetchImpl);

/** Every attempt to pay an order, failed ones included. */
export const fetchOrderPayments = async (cfg: RazorpayConfig, orderId: string, fetchImpl: typeof fetch = fetch) =>
  (await rzp<{ items: RazorpayPayment[] }>(cfg, `/orders/${encodeURIComponent(orderId)}/payments`, { method: "GET" }, fetchImpl)).items ?? [];

/** Refund part or all of a captured payment. */
export const createRefund = (
  cfg: RazorpayConfig,
  paymentId: string,
  amountPaise: number,
  notes: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
) =>
  rzp<RazorpayRefund>(
    cfg,
    `/payments/${encodeURIComponent(paymentId)}/refund`,
    { method: "POST", body: JSON.stringify({ amount: amountPaise, speed: "normal", notes }) },
    fetchImpl,
  );
