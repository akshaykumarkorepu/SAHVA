/**
 * Platform figures for the admin overview. Pure, so the money maths is tested.
 *
 * MRR counts what paying clinics are worth per month right now: a monthly
 * plan at its monthly price, a yearly plan at a twelfth of its yearly price.
 * Trials and lapsed clinics count zero. Collected revenue is separate — it is
 * cash that arrived in a period, which for yearly plans is very different.
 */

type Sub = {
  clinic_id: string;
  status: string;
  billing_cycle: string | null;
  current_period_end: string;
  trial_ends_at: string | null;
};
type Payment = { amount_paise: number; paid_at: string | null; status: string };
type Price = { monthly_price_paise: number; yearly_price_paise: number | null };

export type Overview = {
  clinics: number;
  newClinicsThisMonth: number;
  trialing: number;
  trialsEndingIn3Days: number;
  paying: number;
  payingMonthly: number;
  payingYearly: number;
  lapsed: number;
  mrrPaise: number;
  arrPaise: number;
  collectedThisMonthPaise: number;
  paymentsThisMonth: number;
};

export function overview(
  input: { clinics: { created_at: string }[]; subs: Sub[]; payments: Payment[]; price: Price },
  now: Date = new Date(),
): Overview {
  const t = now.getTime();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
  const live = (s: Sub) => new Date(s.current_period_end).getTime() > t;

  const trialing = input.subs.filter((s) => s.status === "trialing" && live(s));
  const paying = input.subs.filter((s) => s.status === "active" && live(s));
  const yearly = paying.filter((s) => s.billing_cycle === "yearly");
  const monthly = paying.filter((s) => s.billing_cycle !== "yearly");
  const yearlyPrice = input.price.yearly_price_paise ?? input.price.monthly_price_paise * 12;
  const mrr = monthly.length * input.price.monthly_price_paise + Math.round((yearly.length * yearlyPrice) / 12);

  const paidThisMonth = input.payments.filter(
    (p) => p.status === "paid" && p.paid_at && new Date(p.paid_at).getTime() >= monthStart,
  );

  return {
    clinics: input.clinics.length,
    newClinicsThisMonth: input.clinics.filter((c) => new Date(c.created_at).getTime() >= monthStart).length,
    trialing: trialing.length,
    trialsEndingIn3Days: trialing.filter((s) => new Date(s.current_period_end).getTime() - t <= 3 * 86_400_000).length,
    paying: paying.length,
    payingMonthly: monthly.length,
    payingYearly: yearly.length,
    lapsed: input.subs.filter((s) => !live(s)).length,
    mrrPaise: mrr,
    arrPaise: mrr * 12,
    collectedThisMonthPaise: paidThisMonth.reduce((n, p) => n + p.amount_paise, 0),
    paymentsThisMonth: paidThisMonth.length,
  };
}
