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
      className="relative overflow-hidden p-4 animate-fade-up sm:p-6"
    >
      <div style={{ animationDelay: `${delay}ms` }}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            {label}
          </p>
          {icon && (
            <span className={cn("hidden h-8 w-8 shrink-0 sm:grid place-items-center rounded-xl ring-1 ring-inset transition-colors duration-200 group-hover:ring-brand-500/30", chip)}>
              <Icon name={icon} className="h-4 w-4" />
            </span>
          )}
        </div>
        <p className={cn("mt-3 font-display sm:mt-4 text-stat tabular-nums tracking-tight", accent)}>{value}</p>
        {sub && <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{sub}</p>}
      </div>
    </Card>
  );
}
