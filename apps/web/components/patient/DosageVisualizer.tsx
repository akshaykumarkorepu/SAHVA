import { parseDose, type Slot } from "@/lib/dose";
import { cn } from "@/components/ui";

const SLOTS: { key: Slot; icon: string; te: string; en: string }[] = [
  { key: "morning", icon: "🌅", te: "ఉదయం", en: "Morning" },
  { key: "afternoon", icon: "☀️", te: "మధ్యాహ్నం", en: "Afternoon" },
  { key: "night", icon: "🌙", te: "రాత్రి", en: "Night" },
];

/**
 * When to take a medicine, as three boxes — for patients who find
 * "1-0-1, after food" hard to read. Drawn only when the prescription states
 * the timing unambiguously (lib/dose.ts); otherwise it draws nothing and the
 * doctor's own words, which the card always shows, are the instruction.
 */
export function DosageVisualizer({
  frequency,
  instructions,
  L,
}: {
  frequency: string | null;
  instructions: string | null;
  L: boolean;
}) {
  const dose = parseDose(frequency, instructions);
  if (!dose.slots) return null;

  return (
    <div className="mt-2.5">
      <ol className="grid grid-cols-3 gap-1.5" aria-label={L ? "ఎప్పుడు వేసుకోవాలి" : "When to take"}>
        {SLOTS.map((s) => {
          const on = dose.slots!.has(s.key);
          return (
            <li
              key={s.key}
              aria-label={`${L ? s.te : s.en}: ${on ? (L ? "అవును" : "yes") : L ? "లేదు" : "no"}`}
              className={cn(
                "flex flex-col items-center rounded-lg border py-1.5 text-[11px]",
                on ? "border-brand-500/40 bg-brand-500/10 font-semibold text-ink" : "border-line text-ink-subtle opacity-60",
              )}
            >
              <span aria-hidden className={cn("text-base", !on && "grayscale")}>
                {s.icon}
              </span>
              {L ? s.te : s.en}
              <span aria-hidden className="text-[10px]">{on ? "✓" : "—"}</span>
            </li>
          );
        })}
      </ol>
      {dose.food && (
        <p
          className={cn(
            "mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold",
            dose.food === "after" ? "bg-accent-sky/10 text-accent-sky" : "bg-accent-amber/10 text-accent-amber",
          )}
        >
          {dose.food === "after" ? (L ? "భోజనం తర్వాత" : "After food") : L ? "భోజనానికి ముందు" : "Before food"}
        </p>
      )}
    </div>
  );
}
