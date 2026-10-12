/**
 * Reads a prescription line into a morning / afternoon / night chart.
 *
 * Medication timing is not something to guess. This only returns a chart
 * when the doctor's words say it unambiguously — "1-0-1", or a count that
 * matches the times named ("twice daily … after breakfast and after
 * dinner"). Anything else — "once daily" with no time, a count that
 * disagrees with the times, an unrecognised pattern — returns no chart, and
 * the screen shows the doctor's own words instead. Those words are always
 * shown regardless; the chart is only ever a reading aid.
 */

export type Slot = "morning" | "afternoon" | "night";

export type Dose = {
  /** Null when the timing cannot be read with certainty. */
  slots: Set<Slot> | null;
  /** How many times a day, when stated. */
  perDay: number | null;
  food: "before" | "after" | null;
};

const TIMES: [Slot, RegExp][] = [
  ["morning", /\b(morning|breakfast)\b/i],
  ["afternoon", /\b(afternoon|lunch|noon)\b/i],
  ["night", /\b(night|dinner|bed ?time|hs)\b/i],
];

function countFrom(text: string): number | null {
  if (/\b(once|od|1 ?time)\b/i.test(text)) return 1;
  if (/\b(twice|bd|bid|2 ?times)\b/i.test(text)) return 2;
  if (/\b(thrice|tds|tid|3 ?times|three times)\b/i.test(text)) return 3;
  return null;
}

export function parseDose(frequency: string | null, instructions: string | null): Dose {
  const freq = frequency ?? "";
  const all = `${freq} ${instructions ?? ""}`;

  const named = new Set<Slot>(TIMES.filter(([, re]) => re.test(all)).map(([s]) => s));

  const after = /\bafter (food|meals?|breakfast|lunch|dinner|eating)\b/i.test(all);
  const before = /\b(before (food|meals?|breakfast|lunch|dinner|eating)|empty stomach)\b/i.test(all);
  const food = after && !before ? "after" : before && !after ? "before" : null;

  // "1-0-1", "1-1-1", "0-0-1": the Indian prescription shorthand.
  const pattern = freq.match(/^\s*([01])\s*-\s*([01])\s*-\s*([01])\s*$/);
  if (pattern) {
    const slots = new Set<Slot>();
    if (pattern[1] === "1") slots.add("morning");
    if (pattern[2] === "1") slots.add("afternoon");
    if (pattern[3] === "1") slots.add("night");
    // The instructions naming different times than the pattern is a conflict.
    const agrees = named.size === 0 || [...named].every((s) => slots.has(s));
    return { slots: agrees && slots.size > 0 ? slots : null, perDay: slots.size || null, food };
  }

  const perDay = countFrom(freq) ?? countFrom(instructions ?? "");
  if (named.size > 0 && (perDay === null || perDay === named.size)) {
    return { slots: named, perDay: perDay ?? named.size, food };
  }
  return { slots: null, perDay, food };
}
