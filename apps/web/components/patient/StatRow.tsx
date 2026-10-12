import { cn } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Tile } from "./logic";

export function StatRow({
  stats,
  L,
}: {
  L: boolean;
  stats: Tile[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className={cn(
            "rounded-2xl border bg-surface-raised p-4",
            s.tone === "warn" ? "border-accent-amber/35 bg-accent-amber/[0.05]" : "border-line",
          )}
        >
          <Icon
            name={s.icon}
            className={cn("h-4 w-4", s.tone === "warn" ? "text-accent-amber" : "text-ink-subtle")}
          />
          <p className="mt-2.5 font-display text-lg font-bold tracking-tight text-ink">{s.value}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
