import type { IconName } from "@/components/icons";
import type { Condition, Invoice, Prescription, Vaccination } from "./types";

/**
 * The patient record's arithmetic, kept free of React so it can be tested
 * without a DOM. Everything here is date or money maths that has been wrong
 * before or is easy to get wrong.
 */

export const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** Whole days from today to an ISO date, negative when it has passed. */
export function daysFromToday(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(`${isoDate}T00:00:00`);
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

export function isActiveRx(rx: Prescription): boolean {
  const longest = Math.max(0, ...rx.items.map((i) => i.duration_days ?? 0));
  if (longest === 0) return false;
  const ends = new Date(rx.issued_at).getTime() + longest * 86_400_000;
  return ends >= Date.now();
}

export type Tile = { icon: IconName; value: string; label: string; tone?: "warn" };

/**
 * Summary tiles above the record.
 *
 * Tiles earn their place. A row of zeroes is noise, and on a record with
 * nothing in it yet that row was most of the screen.
 */
export function buildTiles({
  L,
  activeRx,
  vaccinesDue,
  owed,
  conditions,
}: {
  L: boolean;
  activeRx: Prescription[];
  vaccinesDue: Vaccination[];
  owed: number;
  conditions: Condition[];
}): Tile[] {
  const tiles: Tile[] = [];
  if (activeRx.length > 0) {
    tiles.push({
      icon: "activity",
      value: String(activeRx.reduce((n, r) => n + r.items.length, 0)),
      label: L ? "ప్రస్తుత మందులు" : "Medicines you take",
    });
  }
  if (vaccinesDue.length > 0) {
    tiles.push({
      icon: "shield",
      value: String(vaccinesDue.length),
      label: L ? "రాబోయే టీకాలు" : "Vaccines due",
      tone: vaccinesDue.some((v) => v.status === "overdue") ? "warn" : undefined,
    });
  }
  if (owed > 0) {
    tiles.push({
      icon: "rupee",
      value: rupees(owed),
      label: L ? "చెల్లించాల్సినది" : "Amount to pay",
      tone: "warn",
    });
  }
  if (conditions.length > 0) {
    tiles.push({
      icon: "heart",
      value: String(conditions.length),
      label: L ? "ప్రస్తుత పరిస్థితులు" : "Ongoing conditions",
    });
  }
  return tiles;
}

/** Sum of issued, unpaid invoices, in paise. Drafts and voids are not owed. */
export function amountOwed(invoices: Invoice[]): number {
  return invoices.filter((i) => i.status === "issued").reduce((s, i) => s + i.total_paise, 0);
}
