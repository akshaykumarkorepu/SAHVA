import { dbAdmin } from "./supabase.js";
import { mailerConfigured } from "./mailer.js";
import { razorpayConfig } from "./razorpay.js";

export type Check = { name: string; ok: boolean; detail: string };

/** How old each job may get before it counts as stopped, in minutes. */
export const LIMITS: Record<string, number> = {
  database_jobs: 30, // runs every 5–15 minutes from three triggers
  email_sender: 45,
  payment_reconcile: 26 * 60,
};

/**
 * Is anything broken that a person must hear about? Pure over its inputs so
 * the rules are tested. A job that is not configured (no email provider, no
 * Razorpay keys) is not counted as down.
 */
export function evaluate(
  jobs: { job: string; minutes_since_ok: number | null; last_error: string | null }[],
  configured: { email: boolean; payments: boolean },
  dbOk: boolean,
): { ok: boolean; checks: Check[] } {
  const checks: Check[] = [{ name: "database", ok: dbOk, detail: dbOk ? "reachable" : "unreachable" }];
  for (const [job, limit] of Object.entries(LIMITS)) {
    if (job === "email_sender" && !configured.email) continue;
    if (job === "payment_reconcile" && !configured.payments) continue;
    const row = jobs.find((j) => j.job === job);
    const age = row?.minutes_since_ok ?? null;
    const ok = age !== null && age <= limit;
    checks.push({
      name: job,
      ok,
      detail: age === null ? "never succeeded" : `last ok ${age} min ago${ok ? "" : ` (limit ${limit})`}${row?.last_error ? `; last error: ${row.last_error}` : ""}`,
    });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

export async function systemHealth() {
  let payments = true;
  try {
    razorpayConfig();
  } catch {
    payments = false;
  }
  const { data, error } = await dbAdmin.rpc("job_health");
  return evaluate((data ?? []) as never, { email: mailerConfigured(), payments }, !error);
}
