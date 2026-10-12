import { ApiError } from "@/lib/api";
import type { Strings } from "./i18n";

/** Fills {placeholders}; an unknown one is left visible rather than blank. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function aheadText(n: number, t: Strings): string {
  if (n === 0) return t.aheadNone;
  if (n === 1) return t.aheadOne;
  return fill(t.aheadMany, { n });
}

/**
 * What a patient reads when something fails — in their language, never the
 * API's English message, and never a code.
 */
export function portalError(e: unknown, t: Strings): string {
  if (e instanceof ApiError) {
    if (e.isSlotTaken) return t.errSlotTaken;
    if (e.status === 429) return t.errTooMany;
    if (e.status === 409 || e.status === 400 || e.code === "NOT_CONFIRMABLE") return t.errNoLonger;
    return t.errGeneric;
  }
  // fetch() rejects with a TypeError when there is no connection at all.
  if (e instanceof TypeError) return t.errNetwork;
  return t.errGeneric;
}

/**
 * The message a patient forwards to whoever is bringing them. Logistics only:
 * the portal link is a credential and stays out of it.
 */
export function shareText(
  t: Strings,
  v: { name: string; when: string; doctor: string; clinic: string; place: string; phone: string },
): string {
  return fill(t.shareTemplate, v);
}
