/**
 * The offer, in one place. The database (plans) is the source of truth for
 * what is charged — the API reads the amount from there, never from the
 * page — but the marketing page renders before anyone signs in, so it needs
 * the figures too. A unit test keeps the two in step with the migration.
 */
export const PRICE = {
  monthlyPaise: 199900,
  yearlyPaise: 999900,
  trialDays: 14,
} as const;

/** "₹1,999" — Indian digit grouping, no paise for whole rupees. */
export function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** What a year costs paying monthly, minus the yearly price. */
export function yearlySaving(monthlyPaise: number = PRICE.monthlyPaise, yearlyPaise: number = PRICE.yearlyPaise) {
  const saved = monthlyPaise * 12 - yearlyPaise;
  return { paise: saved, percent: Math.round((saved / (monthlyPaise * 12)) * 100) };
}

/** Yearly price as a per-month figure, for comparison only. */
export const perMonthOnYearly = (yearlyPaise: number = PRICE.yearlyPaise) => Math.round(yearlyPaise / 12);

/** Whole days left, counting a partial day as a day; never negative. */
export function daysLeft(untilIso: string | null, now: Date = new Date()): number {
  if (!untilIso) return 0;
  return Math.max(0, Math.ceil((new Date(untilIso).getTime() - now.getTime()) / 86_400_000));
}

export type SubscriptionState = "trial" | "trial_ended" | "active" | "lapsed" | "none";

export function subscriptionState(
  sub: { status: string; trial_ends_at: string | null; current_period_end: string } | null,
  now: Date = new Date(),
): SubscriptionState {
  if (!sub) return "none";
  const end = new Date(sub.current_period_end).getTime();
  if (sub.status === "trialing") return end > now.getTime() ? "trial" : "trial_ended";
  if (sub.status === "active") return end > now.getTime() ? "active" : "lapsed";
  return "lapsed";
}
