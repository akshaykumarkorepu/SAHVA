import { env } from "../config/env.js";
import { dbAdmin } from "./supabase.js";
import { logger } from "./logger.js";
import { render, type Outgoing } from "./notify.js";
import { mailerConfigured, sendEmail } from "./mailer.js";

export type RunSummary = {
  queued: number;
  invoices_issued: number;
  transcripts_purged: number;
  security_alerts: number;
  requests_expired: number;
  sent: number;
  failed: number;
  email_configured: boolean;
};

/**
 * One pass of the scheduled job: queue what time has made due, issue any
 * invoices still owed, delete transcripts past each clinic's retention,
 * raise alerts for bursts of refused requests, then send a batch of emails.
 * Run every 15 minutes.
 */
export async function runNotifications(batch = 50): Promise<RunSummary> {
  const queued = await dbAdmin.rpc("enqueue_scheduled_notifications");
  if (queued.error) throw queued.error;
  const invoices = await dbAdmin.rpc("issue_missing_invoices");
  if (invoices.error) throw invoices.error;
  const purged = await dbAdmin.rpc("purge_expired_transcripts", { p_limit: 500 });
  if (purged.error) throw purged.error;
  const alerts = await dbAdmin.rpc("enqueue_security_alerts");
  if (alerts.error) throw alerts.error;
  const expired = await dbAdmin.rpc("expire_unverified_bookings");
  if (expired.error) throw expired.error;

  const summary: RunSummary = {
    queued: queued.data ?? 0,
    invoices_issued: invoices.data ?? 0,
    transcripts_purged: purged.data ?? 0,
    security_alerts: alerts.data ?? 0,
    requests_expired: expired.data ?? 0,
    sent: 0,
    failed: 0,
    email_configured: mailerConfigured(),
  };
  // Without a provider, leave everything queued rather than burning retries.
  if (!summary.email_configured) return summary;

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
  return summary;
}
