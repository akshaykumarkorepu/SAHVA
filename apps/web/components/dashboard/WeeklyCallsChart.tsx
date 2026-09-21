"use client";

import { Card } from "../ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function WeeklyCallsChart({
  data,
}: {
  data: { day: string; calls: number; bookings: number }[];
}) {
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Call volume (last 7 days)</h3>
          <p className="text-xs text-ink-500">Total calls vs. successful bookings</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary-500" /> Calls
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent-500" /> Bookings
          </span>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
            <Tooltip
              cursor={{ fill: "#f1f5f9" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="calls" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="bookings" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
