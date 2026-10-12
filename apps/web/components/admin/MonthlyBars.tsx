"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * One measure per month, as bars. A single series: the card's title names it,
 * so there is no legend. brand-500 is the fill — it passes the palette
 * validator's chroma floor on white; brand-600 reads as grey there.
 */
export function MonthlyBars<T extends { month: string }>({
  data,
  value,
  format,
  detail,
  label,
}: {
  data: T[];
  value: (row: T) => number;
  format: (n: number) => string;
  /** An extra line in the tooltip, e.g. how much of it was AI. */
  detail?: (row: T) => string | null;
  label: string;
}) {
  const rows = data.map((r) => ({ ...r, __v: value(r), __m: monthLabel(r.month) }));
  return (
    <div className="h-52 w-full" role="img" aria-label={`${label} by month`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="__m" tickLine={false} axisLine={false} dy={6} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(n: number) => format(n)} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgb(var(--surface-sunken))" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as T & { __v: number; __m: string };
              const extra = detail?.(row);
              return (
                <div className="rounded-xl border border-line bg-surface-raised px-3 py-2 text-xs shadow-lift">
                  <p className="text-ink-subtle">{row.__m}</p>
                  <p className="font-semibold text-ink">
                    {label}: {format(row.__v)}
                  </p>
                  {extra && <p className="text-ink-muted">{extra}</p>}
                </div>
              );
            }}
          />
          <Bar dataKey="__v" fill="rgb(var(--brand-500))" radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function monthLabel(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}
