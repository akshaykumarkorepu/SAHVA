import { env } from "../config/env.js";
import { dbAdmin } from "./supabase.js";
import { logger } from "./logger.js";
import { render, type Outgoing } from "./notify.js";
import { mailerConfigured, sendEmail } from "./mailer.js";

export type RunSummary = { queued: number; invoices_issued: number; sent: number; failed: number; email_configured: boolean };

/**
 * One pass of the notifications job: queue what time has made due, issue any
 * invoices still owed, then send a batch. Run every 15 minutes.
 */
export async function runNotifications(batch = 50): Promise<RunSummary> {
  const queued = await dbAdmin.rpc("enqueue_scheduled_notifications");
  if (queued.error) throw queued.error;
  const invoices = await dbAdmin.rpc("issue_missing_invoices");
  if (invoices.error) throw invoices.error;

  const summary: RunSummary = {
    queued: queued.data ?? 0,
    invoices_issued: invoices.data ?? 0,
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
