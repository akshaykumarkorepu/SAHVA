"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function CallVolumeChart({
  data,
}: {
  data: { day: string; total_calls: number; bookings: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink-500">
        No calls yet in this period.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #f1f5f9",
              fontSize: 12,
              boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
            }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="total_calls" name="Calls" fill="#059669" radius={[4, 4, 0, 0]} />
          <Bar dataKey="bookings" name="Bookings" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
