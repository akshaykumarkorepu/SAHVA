"use client";

import { Card } from "../ui";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS: Record<string, string> = {
  English: "#10b981",
  Telugu: "#0ea5e9",
  Mixed: "#f59e0b",
};

export function LanguageSplitChart({
  split,
}: {
  split: { en: number; te: number; mixed: number; unknown: number };
}) {
  const data = [
    { name: "English", value: split.en },
    { name: "Telugu", value: split.te },
    { name: "Mixed", value: split.mixed },
  ].filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-ink-900">Language mix</h3>
      <p className="mb-2 text-xs text-ink-500">Across all calls (lifetime)</p>
      <div className="h-56">
        {total === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-500">
            No calls yet — start a demo call to populate.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={COLORS[d.name] || "#94a3b8"} />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: "#475569" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
