"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "../ui";
import type { Appointment } from "@/lib/api";
import { addDaysIso, formatTime, formatDate, todayIso } from "@/lib/format";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AppointmentsCalendar({
  calendar,
  rangeStart,
  rangeEnd,
}: {
  calendar: Record<string, Appointment[]>;
  rangeStart: string;
  rangeEnd: string;
}) {
  // Build the 7 days
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDaysIso(rangeStart, i));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-900">This week</h3>
        <span className="text-xs text-ink-500">{formatDate(rangeStart)} – {formatDate(rangeEnd)}</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const date = new Date(`${d}T00:00:00`);
          const dow = DAY_LABELS[date.getDay()];
          const list = calendar[d] || [];
          const isToday = d === todayIso();
          return (
            <div
              key={d}
              className={`min-h-[180px] rounded-lg border p-2 ${
                isToday ? "border-primary-300 bg-primary-50/50" : "border-ink-100 bg-white"
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <div className={`text-[11px] font-semibold uppercase ${isToday ? "text-primary-700" : "text-ink-500"}`}>
                  {dow}
                </div>
                <div className={`text-sm font-semibold ${isToday ? "text-primary-700" : "text-ink-900"}`}>
                  {date.getDate()}
                </div>
              </div>
              <div className="space-y-1.5">
                {list.length === 0 && (
                  <div className="text-[11px] text-ink-300">No appts</div>
                )}
                {list.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border border-ink-100 bg-white p-1.5"
                    title={`${a.patient_name} · ${a.doctor_name}`}
                  >
                    <div className="text-[11px] font-semibold text-ink-900">
                      {formatTime(a.starts_at)}
                    </div>
                    <div className="truncate text-[11px] text-ink-700">{a.patient_name}</div>
                    <div className="truncate text-[10px] text-ink-500">{a.doctor_name}</div>
                    {a.status !== "booked" && (
                      <div className="mt-1">
                        <Badge tone={a.status === "cancelled" ? "bad" : "warn"}>
                          {a.status}
                        </Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
