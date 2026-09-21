"use client";

import { Card } from "../ui";

export function KpiCard({
  label,
  value,
  hint,
  trend,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  trend?: { dir: "up" | "down" | "flat"; text: string };
  icon: string;
  tone?: "default" | "good" | "warn";
}) {
  const accent =
    tone === "good"
      ? "from-primary-500 to-primary-600"
      : tone === "warn"
      ? "from-amber-400 to-amber-500"
      : "from-sky-400 to-sky-500";
  return (
    <Card className="relative overflow-hidden p-5">
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-10 ${accent}`}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {label}
          </div>
          <div className="mt-2 text-3xl font-semibold text-ink-900">{value}</div>
          {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
          {trend && (
            <div
              className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
                trend.dir === "up"
                  ? "text-primary-700"
                  : trend.dir === "down"
                  ? "text-rose-600"
                  : "text-ink-500"
              }`}
            >
              <span>{trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "•"}</span>
              {trend.text}
            </div>
          )}
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-white ${accent}`}
        >
          <span className="text-lg">{icon}</span>
        </div>
      </div>
    </Card>
  );
}
