/**
 * A clinic health score: 100 minus what is going wrong, each deduction with
 * the reason in words. The point is not the number — it is the list of
 * clinics worth a phone call this week, and why.
 *
 * Not scored: clinics still in review or rejected (nothing to measure yet).
 */
export type Signals = {
  verification_status: string;
  subscription_status: string | null;
  current_period_end: string | null;
  ever_paid: boolean;
  bookings_14d: number;
  bookings_prev_14d: number;
  open_actions: number;
  oldest_action_at: string | null;
  last_staff_sign_in: string | null;
  created_at: string;
};

export type Health = { score: number; band: "healthy" | "watch" | "at_risk"; reasons: string[] } | null;

const DAY = 86_400_000;

export function health(s: Signals, now: Date = new Date()): Health {
  if (["submitted", "under_review", "needs_info", "rejected"].includes(s.verification_status)) return null;

  const t = now.getTime();
  const reasons: string[] = [];
  let score = 100;
  const take = (n: number, why: string) => {
    score -= n;
    reasons.push(why);
  };

  if (s.verification_status === "suspended") take(40, "Suspended by SAHVA");

  if (s.current_period_end) {
    const end = new Date(s.current_period_end).getTime();
    if (end + 3 * DAY <= t) take(40, "Not live: trial or plan ended more than 3 days ago");
    else if (end <= t) take(25, "Plan ended — patient features stop within 3 days");
    else if (s.subscription_status === "trialing" && !s.ever_paid && end - t <= 3 * DAY) {
      const d = Math.max(1, Math.ceil((end - t) / DAY));
      take(20, `Trial ends in ${d} day${d === 1 ? "" : "s"}, not paid yet`);
    }
  }

  const ageDays = (t - new Date(s.created_at).getTime()) / DAY;
  if (s.bookings_14d === 0 && ageDays > 14) take(30, "No bookings in two weeks");
  else if (s.bookings_prev_14d >= 5 && s.bookings_14d <= s.bookings_prev_14d / 2) {
    const drop = Math.round((1 - s.bookings_14d / s.bookings_prev_14d) * 100);
    take(15, `Bookings down ${drop}% on the fortnight before`);
  }

  if (!s.last_staff_sign_in) {
    if (ageDays > 7) take(25, "No staff member has ever signed in");
  } else {
    const idle = (t - new Date(s.last_staff_sign_in).getTime()) / DAY;
    if (idle >= 14) take(25, `No staff sign-in for ${Math.floor(idle)} days`);
    else if (idle >= 7) take(15, `No staff sign-in for ${Math.floor(idle)} days`);
  }

  const oldest = s.oldest_action_at ? (t - new Date(s.oldest_action_at).getTime()) / DAY : 0;
  if (s.open_actions > 10 || oldest > 3) {
    take(10, `${s.open_actions} Action Required item${s.open_actions === 1 ? "" : "s"} waiting${oldest > 3 ? `, oldest ${Math.floor(oldest)} days` : ""}`);
  }

  score = Math.max(0, score);
  return { score, band: score >= 75 ? "healthy" : score >= 50 ? "watch" : "at_risk", reasons };
}
