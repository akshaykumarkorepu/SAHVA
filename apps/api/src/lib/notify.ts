/**
 * What each notification says. Pure: a row from the outbox in, an email out,
 * so every template is unit-tested without sending anything.
 *
 * Plain, short English — owners read these on a phone between patients.
 * Nothing about any patient is ever included; payloads carry clinic-level
 * facts only.
 */

export type Outgoing = { kind: string; audience: "clinic" | "admin"; to_name: string | null; payload: Record<string, unknown> };
export type Email = { subject: string; text: string; html: string };
export type Links = { web: string; admin: string };

const rupees = (paise: unknown) =>
  `₹${(Number(paise ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (iso: unknown) =>
  typeof iso === "string"
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—";
const str = (v: unknown) => (typeof v === "string" ? v : "");

type Body = { subject: string; lines: string[]; action?: { label: string; href: string } };

function clinicBody(kind: string, p: Record<string, unknown>, l: Links): Body {
  const clinic = str(p.clinic_name) || "your clinic";
  const billing = { label: "Open billing", href: `${l.web}/dashboard/settings/billing` };
  switch (kind) {
    case "application.received":
      return {
        subject: `We received ${clinic}'s application`,
        lines: [
          `Thank you for applying to SAHVA. Our team checks your clinic's registration and the doctor's council registration, usually within two working days.`,
          `You can set up doctors, hours and FAQs while you wait. Nothing reaches patients until the clinic is approved.`,
        ],
        action: { label: "See your application", href: `${l.web}/dashboard/verification` },
      };
    case "application.needs_info":
      return {
        subject: `${clinic}: we need a little more information`,
        lines: [`Our reviewer asked for the following:`, `“${str(p.note)}”`, `Update the application and it goes back into review.`],
        action: { label: "Update the application", href: `${l.web}/dashboard/verification` },
      };
    case "application.approved":
      return {
        subject: `${clinic} is approved — your free trial has started`,
        lines: [
          `Your clinic is verified. The AI receptionist, WhatsApp confirmations and online booking are now live for your patients.`,
          `Your 14-day free trial runs until ${day(p.trial_ends_at)}. No card is needed until then.`,
        ],
        action: { label: "Open the dashboard", href: `${l.web}/dashboard` },
      };
    case "application.rejected":
      return {
        subject: `${clinic}'s application was not approved`,
        lines: [`We could not approve the application. The reviewer's reason:`, `“${str(p.note)}”`, `Reply to this email if you think this is a mistake.`],
      };
    case "clinic.suspended":
      return {
        subject: `${clinic} has been suspended`,
        lines: [`Patient-facing features are paused. The reason given:`, `“${str(p.note)}”`, `Your data is safe. Reply to this email to sort it out.`],
      };
    case "clinic.reinstated":
      return { subject: `${clinic} is live again`, lines: [`Your clinic has been reinstated. Patient-facing features are back on.`], action: { label: "Open the dashboard", href: `${l.web}/dashboard` } };
    case "trial.ending":
    case "subscription.ending": {
      const what = kind === "trial.ending" ? "free trial" : "paid plan";
      const when = Number(p.days) <= 1 ? "tomorrow" : "in 3 days";
      return {
        subject: `${clinic}: your ${what} ends ${when}`,
        lines: [
          `Your ${what} ends on ${day(p.ends_at)}. Plans are prepaid and never renew on their own.`,
          `Pay ₹1,999 for a month or ₹9,999 for a year to keep the AI receptionist answering. If nothing is paid, patient features stop 3 days after the end date.`,
        ],
        action: { label: "Choose a plan", href: billing.href },
      };
    }
    case "subscription.lapsed":
      return {
        subject: `${clinic}: patient features stop on ${day(p.stops_at)}`,
        lines: [
          `Your ${p.was_trial ? "free trial" : "plan"} ended on ${day(p.ended_at)}. Everything keeps working for 3 more days.`,
          `After ${day(p.stops_at)} the AI will stop booking and patient links will pause until a payment is made. Your data stays safe.`,
        ],
        action: { label: "Pay now", href: billing.href },
      };
    case "payment.received":
      return {
        subject: `Payment received: ${rupees(p.amount_paise)}`,
        lines: [
          `Thank you. ${rupees(p.amount_paise)} for ${p.billing_cycle === "yearly" ? "a year" : "a month"} of SAHVA is paid, and your plan runs until ${day(p.period_end)}.`,
          `Payment reference: ${str(p.payment_ref)}. Your invoice is in Settings → Billing.`,
        ],
        action: { label: "View invoice", href: billing.href },
      };
    case "payment.failed":
      return {
        subject: `Your payment of ${rupees(p.amount_paise)} did not go through`,
        lines: [`Razorpay reported the payment as failed, so no money was taken for it. You can try again with UPI, a card or netbanking.`],
        action: { label: "Try again", href: billing.href },
      };
    case "refund.processed":
      return {
        subject: `Refund of ${rupees(p.amount_paise)} processed`,
        lines: [
          `We have refunded ${rupees(p.amount_paise)}. Banks usually show it within 5–7 working days.`,
          `Refund reference: ${str(p.refund_ref)}. The credit note is in Settings → Billing.`,
        ],
        action: billing,
      };
    default:
      return { subject: `An update from SAHVA`, lines: [`There is an update for ${clinic}.`], action: { label: "Open SAHVA", href: `${l.web}/dashboard` } };
  }
}

const EXCEPTION_LABEL: Record<string, string> = {
  paid_not_activated: "Paid but not activated",
  duplicate_payment: "Possible duplicate payment",
  amount_mismatch: "Amount mismatch",
  authorized_not_captured: "Authorised, not captured",
  refund_failed: "Refund failed",
  dispute: "Dispute / chargeback",
};

function adminBody(kind: string, p: Record<string, unknown>, l: Links): Body {
  const clinic = str(p.clinic_name) || "A clinic";
  switch (kind) {
    case "admin.new_application":
    case "admin.application_resubmitted":
      return {
        subject: `${kind === "admin.new_application" ? "New application" : "Application resubmitted"}: ${clinic}${p.city ? `, ${str(p.city)}` : ""}`,
        lines: [`${clinic} is waiting for verification.`],
        action: { label: "Review it", href: `${l.admin}/admin/applications/${str(p.clinic_id)}` },
      };
    case "admin.payment_exception": {
      const label = EXCEPTION_LABEL[str(p.exception_kind)] ?? str(p.exception_kind);
      return {
        subject: `${p.exception_kind === "dispute" ? "URGENT — " : ""}${label}: ${clinic}`,
        lines: [`${label}${p.amount_paise ? ` for ${rupees(p.amount_paise)}` : ""}.`, `Reference: ${str(p.payment_ref) || "—"}`],
        action: { label: "Open payments", href: `${l.admin}/admin/payments` },
      };
    }
    case "admin.refund_approval":
      return {
        subject: `Refund of ${rupees(p.amount_paise)} needs your approval — ${clinic}`,
        lines: [`${str(p.requested_by) || "An admin"} asked to refund ${rupees(p.amount_paise)}.`, `Reason: “${str(p.reason)}”`, `A second finance admin must approve it.`],
        action: { label: "Approve or decline", href: `${l.admin}/admin/payments` },
      };
    case "admin.support_access_granted":
      return {
        subject: `${clinic} opened support access until ${day(p.expires_at)}`,
        lines: [`The clinic's reason: “${str(p.reason)}”`, `Every record opened is shown to the clinic owner.`],
        action: { label: "Open the clinic", href: `${l.admin}/admin/clinics/${str(p.clinic_id)}` },
      };
    case "admin.daily_digest": {
      const n = (k: string) => Number(p[k] ?? 0);
      return {
        subject: `SAHVA daily: ${n("applications_waiting")} applications, ${n("open_exceptions")} payment problems`,
        lines: [
          `Applications waiting: ${n("applications_waiting")} (over 2 days: ${n("applications_overdue")})`,
          `Open payment exceptions: ${n("open_exceptions")}`,
          `Webhook signature failures, last 24h: ${n("signature_failures_24h")}`,
          `Emails that failed to send, last 24h: ${n("failed_emails_24h")}`,
        ],
        action: { label: "Open the console", href: `${l.admin}/admin` },
      };
    }
    default:
      return { subject: `SAHVA admin: ${kind}`, lines: [clinic], action: { label: "Open the console", href: `${l.admin}/admin` } };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function render(n: Outgoing, links: Links): Email {
  const b = n.audience === "admin" ? adminBody(n.kind, n.payload, links) : clinicBody(n.kind, n.payload, links);
  const hello = n.to_name ? `Hello ${n.to_name},` : "Hello,";
  const text = [hello, "", ...b.lines.flatMap((l) => [l, ""]), b.action ? `${b.action.label}: ${b.action.href}` : "", "", "— SAHVA"].join("\n").trim();
  const html = `<!doctype html><html><body style="margin:0;background:#f6f8f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#13302d">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="font-weight:700;color:#0f766e;margin:0 0 16px">SAHVA</p>
<div style="background:#fff;border-radius:16px;padding:24px;border:1px solid #e3eae9">
<p style="margin:0 0 12px">${esc(hello)}</p>
${b.lines.map((l) => `<p style="margin:0 0 12px;line-height:1.5">${esc(l)}</p>`).join("\n")}
${b.action ? `<p style="margin:20px 0 0"><a href="${esc(b.action.href)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">${esc(b.action.label)}</a></p>` : ""}
</div>
<p style="font-size:12px;color:#5b6f6c;margin:16px 0 0">You get this because you ${n.audience === "admin" ? "are a SAHVA admin" : "own a clinic on SAHVA"}.</p>
</div></body></html>`;
  return { subject: b.subject, text, html };
}
