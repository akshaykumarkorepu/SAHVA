import { env } from "../config/env.js";

export type SendResult = { ok: true; id: string } | { ok: false; error: string; retry: boolean };

export function mailerConfigured(): boolean {
  return !!env.RESEND_API_KEY && !!env.EMAIL_FROM;
}

/** Send one email through Resend's HTTP API. Never throws. */
export async function sendEmail(to: string, email: { subject: string; text: string; html: string }, idempotencyKey: string): Promise<SendResult> {
  if (!mailerConfigured()) return { ok: false, error: "email not configured", retry: true };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        // Resend drops a repeat with the same key: a retry after a timeout
        // that actually delivered does not send twice.
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    if (r.ok && body.id) return { ok: true, id: body.id };
    // 4xx other than rate limiting will not get better by retrying.
    return { ok: false, error: `${r.status} ${body.message ?? ""}`.trim(), retry: r.status === 429 || r.status >= 500 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed", retry: true };
  }
}
