import { logger } from "./logger.js";
import { dbAdmin } from "./supabase.js";
import { recordJob, runNotifications } from "./notifications.js";
import { reconcile } from "./reconcile.js";
import { razorpayConfig } from "./razorpay.js";

/**
 * The API's own trigger for scheduled work — one of three (pg_cron in the
 * database, this, GitHub Actions), so no single one failing stops reminders,
 * invoices, retention or payment checks. Safe with several API instances:
 * the database jobs take an advisory lock, emails are claimed with SKIP
 * LOCKED, and reconciliation is idempotent.
 */
const EVERY_MS = 5 * 60_000;
const RECONCILE_AFTER_MIN = 20 * 60; // nightly-ish: if the last good run is older than 20 hours

let running = false;

export async function tick(now = Date.now()): Promise<void> {
  if (running) return; // never overlap with ourselves
  running = true;
  try {
    await runNotifications();
  } catch (err) {
    logger.error({ err }, "scheduled notifications failed");
  }
  try {
    if (await reconcileDue()) {
      const summary = await reconcile(razorpayConfig(), new Date(now));
      await recordJob("payment_reconcile", summary.errors === 0, summary.errors ? `${summary.errors} orders could not be checked` : null);
      logger.info({ summary }, "scheduled payment reconciliation");
    }
  } catch (err) {
    await recordJob("payment_reconcile", false, err instanceof Error ? err.message : "failed");
    logger.error({ err }, "scheduled reconciliation failed");
  } finally {
    running = false;
  }
}

async function reconcileDue(): Promise<boolean> {
  try {
    razorpayConfig();
  } catch {
    return false; // payments not set up: nothing to reconcile
  }
  const { data } = await dbAdmin.rpc("job_health");
  const row = (data ?? []).find((r: { job: string }) => r.job === "payment_reconcile") as { minutes_since_ok: number | null } | undefined;
  return !row || row.minutes_since_ok === null || row.minutes_since_ok >= RECONCILE_AFTER_MIN;
}

/** Start the timer. The first run waits a minute so a deploy settles first. */
export function startScheduler(): () => void {
  const first = setTimeout(() => void tick(), 60_000);
  const timer = setInterval(() => void tick(), EVERY_MS);
  first.unref();
  timer.unref();
  logger.info({ everyMinutes: EVERY_MS / 60_000 }, "scheduler started");
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
