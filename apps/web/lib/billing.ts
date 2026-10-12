"use client";

import { ApiError, post } from "./api";
import { isMockMode } from "./mock/flag";

export type BillingStatus = {
  plan: { code: string; name: string; monthly_price_paise: number; yearly_price_paise: number | null };
  subscription: {
    id: string;
    status: string;
    billing_cycle: "monthly" | "yearly" | null;
    trial_ends_at: string | null;
    current_period_end: string;
  } | null;
  payments: {
    id: string;
    billing_cycle: "monthly" | "yearly";
    amount_paise: number;
    period_start: string;
    period_end: string;
    paid_at: string;
    razorpay_payment_id: string;
  }[];
  /** Invoices and credit notes; a payment's appear once SAHVA issues them. */
  invoices?: { id: string; kind: "invoice" | "credit_note"; number: string; payment_id: string; total_paise: number; issued_at: string }[];
  payments_enabled: boolean;
};

type Order = {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  description: string;
  prefill_email: string | null;
};

type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

/** Razorpay Checkout, loaded only when someone actually pays. */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

export type PayOutcome =
  | { kind: "paid" }
  /** Money arrived but is still being confirmed (held, or amount under review). */
  | { kind: "pending"; message: string }
  | { kind: "cancelled" }
  | { kind: "failed"; message: string };

type VerifyReply = { status?: string; message?: string };

/**
 * Pay for a period: create the order on the server, open Razorpay Checkout,
 * then have the server verify Razorpay's signature. "paid" is returned only
 * after the server has verified — never on Checkout's say-so alone.
 */
export async function pay(
  cycle: "monthly" | "yearly",
  /** A failed attempt inside Checkout — it stays open so they can retry. */
  onAttemptFailed: (message: string) => void = () => undefined,
): Promise<PayOutcome> {
  const order = await post<Order>("/billing/orders", { cycle });

  // Mock mode has no Razorpay account: the order is the mock's, and so is
  // the "payment". Clearly not real money, and it still goes through verify.
  if (isMockMode) {
    await post("/billing/verify", {
      razorpay_order_id: order.order_id,
      razorpay_payment_id: `pay_mock_${Date.now()}`,
      razorpay_signature: "mock-signature-not-verified",
    });
    return { kind: "paid" };
  }

  await loadCheckout();
  return new Promise<PayOutcome>((resolve) => {
    let settled = false;
    const done = (o: PayOutcome) => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };
    const rzp = new window.Razorpay!({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: "SAHVA",
      description: order.description,
      prefill: order.prefill_email ? { email: order.prefill_email } : undefined,
      theme: { color: "#0F766E" },
      handler: async (r: CheckoutResult) => {
        try {
          const v = await post<VerifyReply>("/billing/verify", r);
          done(v?.status === "pending" ? { kind: "pending", message: v.message ?? "Payment received and being confirmed." } : { kind: "paid" });
        } catch (e) {
          done({
            kind: "failed",
            message:
              e instanceof ApiError
                ? e.message
                : "We could not confirm the payment. If money left your account, it will be matched shortly.",
          });
        }
      },
      modal: { ondismiss: () => done({ kind: "cancelled" }) },
    });
    // Not the end: Checkout stays open for another try, so this only reports.
    // The outcome is settled by a successful payment or by closing Checkout.
    rzp.on("payment.failed", (r) => {
      const desc = (r as { error?: { description?: string } }).error?.description;
      onAttemptFailed(desc ?? "That attempt did not go through. No money was taken — try again.");
    });
    rzp.open();
  });
}
