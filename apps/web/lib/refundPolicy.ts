/**
 * The refund the published policy (/refund-policy) suggests for a payment.
 * The admin can change it; this is where the conversation starts.
 *
 * - within 7 days of paying: everything not yet refunded
 * - after that, monthly: nothing
 * - after that, yearly: the unused whole months, at a twelfth each
 */
export type RefundablePayment = {
  amount_paise: number;
  captured_paise: number | null;
  refunded_paise: number;
  billing_cycle: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
};

const DAY = 86_400_000;

/**
 * Whole calendar months from a to b. Counted on the calendar, not as days
 * divided by an average month: a 365-day year is 11.99 average months, and
 * flooring that would refund one month short.
 */
export function wholeMonthsBetween(a: Date, b: Date): number {
  if (b <= a) return 0;
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  const shifted = new Date(a);
  shifted.setUTCMonth(a.getUTCMonth() + m);
  if (shifted > b) m -= 1;
  return Math.max(0, m);
}

export function policyRefund(p: RefundablePayment, now: Date = new Date()): { paise: number; why: string } {
  const paid = p.captured_paise ?? p.amount_paise;
  const left = Math.max(0, paid - p.refunded_paise);
  if (left === 0) return { paise: 0, why: "Already fully refunded." };
  if (!p.paid_at) return { paise: 0, why: "Not paid." };

  const daysSince = (now.getTime() - new Date(p.paid_at).getTime()) / DAY;
  if (daysSince <= 7) return { paise: left, why: "Within 7 days of payment: full refund." };
  if (p.billing_cycle !== "yearly") return { paise: 0, why: "Monthly payment, more than 7 days ago: no refund under the policy." };

  const start = new Date(Math.max(now.getTime(), new Date(p.period_start ?? now).getTime()));
  const unusedMonths = wholeMonthsBetween(start, new Date(p.period_end ?? now));
  const paise = Math.min(left, Math.round((paid / 12) * unusedMonths));
  return { paise, why: `Yearly: ${unusedMonths} unused whole month${unusedMonths === 1 ? "" : "s"} at ${Math.round(paid / 12 / 100)} rupees each.` };
}
