"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = { day: string; total_calls: number; bookings: number };

/**
 * Calls against bookings. An area chart rather than bars: the shape of the week
 * is what staff read, and two overlapping areas show the conversion gap
 * directly instead of making you compare bar heights.
 */
export function CallVolumeChart({ data }: { data: Row[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink-subtle">
        No calls yet in this period.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 6, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="gCalls" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--brand-500))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="rgb(var(--brand-500))" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gBookings" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--accent-sky))" stopOpacity={0.26} />
              <stop offset="100%" stopColor="rgb(var(--accent-sky))" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => d.slice(5)}
            tickLine={false}
            axisLine={false}
            dy={6}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} />
          <Tooltip
            cursor={{ stroke: "rgb(var(--line-strong))", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 14,
              border: "1px solid rgb(var(--line))",
              background: "rgb(var(--surface-raised))",
              color: "rgb(var(--ink))",
              fontSize: 12,
              boxShadow: "0 12px 32px -8px rgb(0 0 0 / 0.18)",
            }}
            labelStyle={{ color: "rgb(var(--ink-subtle))", marginBottom: 4 }}
          />
          <Area
            type="monotone"
            dataKey="total_calls"
            name="Calls"
            stroke="rgb(var(--brand-600))"
            strokeWidth={2.2}
            fill="url(#gCalls)"
          />
          <Area
            type="monotone"
            dataKey="bookings"
            name="Bookings"
            stroke="rgb(var(--accent-sky))"
            strokeWidth={2.2}
            fill="url(#gBookings)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
