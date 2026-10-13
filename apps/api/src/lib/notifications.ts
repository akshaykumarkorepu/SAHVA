import { env } from "../config/env.js";
import { dbAdmin } from "./supabase.js";
import { logger } from "./logger.js";
import { render, type Outgoing } from "./notify.js";
import { mailerConfigured, sendEmail } from "./mailer.js";

export type RunSummary = {
  /** The database-side jobs' own summary, or null if another trigger was already running them. */
  database: Record<string, number | string> | null;
  sent: number;
  failed: number;
  email_configured: boolean;
};

/**
 * One pass of the scheduled work. The database-side jobs (reminders, owed
 * invoices, transcript retention, security alerts, releasing unconfirmed
 * requests) run in run_database_jobs() — which pg_cron also triggers — and
 * then a batch of emails is sent. Triggered by the API's own scheduler and by
 * GitHub Actions; every trigger is safe to overlap with the others.
 */
export async function runNotifications(batch = 50): Promise<RunSummary> {
  const jobs = await dbAdmin.rpc("run_database_jobs", { p_source: "api" });
  if (jobs.error) throw jobs.error;

  const summary: RunSummary = {
    database: (jobs.data as Record<string, number | string> | null) ?? null,
    sent: 0,
    failed: 0,
    email_configured: mailerConfigured(),
  };
  // Without a provider, leave everything queued rather than burning retries.
  if (!summary.email_configured) {
    await recordJob("email_sender", true, null, "not configured");
    return summary;
  }

  const claimed = await dbAdmin.rpc("claim_notifications", { p_limit: batch });
  if (claimed.error) throw claimed.error;
  const links = { web: env.WEB_URL, admin: env.ADMIN_URL ?? env.WEB_URL };

  for (const n of claimed.data ?? []) {
    const email = render(n as unknown as Outgoing, links);
    const r = await sendEmail(n.to_email, email, n.id);
    if (r.ok) summary.sent++;
    else {
      summary.failed++;
      logger.warn({ notification: n.id, kind: n.kind, error: r.error }, "email send failed");
    }
    const { error } = await dbAdmin.rpc("finish_notification", {
      p_id: n.id,
      p_ok: r.ok,
      p_message_id: (r.ok ? r.id : null) as string,
      // A permanent failure goes straight to 'failed' by spending the retries.
      p_error: (r.ok ? null : r.retry ? r.error : `permanent: ${r.error}`) as string,
    });
    if (error) logger.error({ err: error, notification: n.id }, "could not record email outcome");
    if (!r.ok && !r.retry) await dbAdmin.from("notifications").update({ status: "failed" }).eq("id", n.id);
  }
  await recordJob("email_sender", summary.failed === 0 || summary.sent > 0, summary.failed ? `${summary.failed} failed` : null);
  return summary;
}

/** Note a job's outcome in job_runs, for health checks. Never throws. */
export async function recordJob(job: string, ok: boolean, error: string | null, source = "api"): Promise<void> {
  const { error: e } = await dbAdmin.rpc("record_job_run", { p_job: job, p_ok: ok, p_error: error as string, p_source: source });
  if (e) logger.warn({ err: e, job }, "could not record job run");
}
