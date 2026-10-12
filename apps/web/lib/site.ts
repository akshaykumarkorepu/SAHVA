/**
 * The business behind the website. Razorpay checks these pages (terms,
 * privacy, refunds, contact) before activating live payments, and they must
 * name a real business — so nothing here is invented. Fill these in; until
 * then the pages show a visible placeholder rather than a made-up address.
 */
export const BUSINESS = {
  /** Registered name, as on the bank account Razorpay pays out to. */
  legalName: "",
  /** Brand shown to customers. */
  brand: "SAHVA",
  address: "",
  email: "",
  phone: "",
  /** Leave empty if not GST-registered. */
  gstin: "",
  /** Courts named in the terms. */
  jurisdiction: "Hyderabad, Telangana",
} as const;

/** The value, or a marked placeholder that cannot be mistaken for real. */
export function biz(field: keyof typeof BUSINESS): string {
  const v = BUSINESS[field];
  return v || `[${field} — set in apps/web/lib/site.ts]`;
}
