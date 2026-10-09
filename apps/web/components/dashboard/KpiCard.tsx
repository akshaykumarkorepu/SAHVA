import { Card, cn } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

/**
 * A single headline number.
 *
 * Tabular numerals and tight tracking so a row of these lines up and reads as
 * data rather than as decoration.
 */
export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  delay = 0,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: IconName;
  tone?: "neutral" | "brand" | "warn" | "bad";
  delay?: number;
}) {
  const accent = {
    neutral: "text-ink",
    brand: "text-brand-600",
    warn: "text-accent-amber",
    bad: "text-accent-rose",
  }[tone];

  const chip = {
    neutral: "bg-surface-sunken text-ink-subtle ring-line",
    brand: "bg-brand-500/10 text-brand-600 ring-brand-500/20",
    warn: "bg-accent-amber/10 text-accent-amber ring-accent-amber/20",
    bad: "bg-accent-rose/10 text-accent-rose ring-accent-rose/20",
  }[tone];

  return (
    <Card
      interactive
      className="relative overflow-hidden p-5 animate-fade-up"
    >
      <div style={{ animationDelay: `${delay}ms` }}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
            {label}
          </p>
          {icon && (
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 ring-inset", chip)}>
              <Icon name={icon} className="h-4 w-4" />
            </span>
          )}
        </div>
        <p className={cn("mt-3 font-display text-stat tabular-nums", accent)}>{value}</p>
        {sub && <p className="mt-1.5 text-xs text-ink-subtle">{sub}</p>}
      </div>
    </Card>
  );
}
