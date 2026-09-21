"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Appointment } from "@/lib/api";
import { AppointmentsCalendar } from "@/components/dashboard/AppointmentsCalendar";
import { Card, Badge } from "@/components/ui";
import {
  addDaysIso,
  formatDateTime,
  formatPhone,
  todayIso,
} from "@/lib/format";

type View = "calendar" | "list";

export default function AppointmentsPage() {
  const [view, setView] = useState<View>("calendar");
  const [calendar, setCalendar] = useState<Record<string, Appointment[]> | null>(null);
  const [list, setList] = useState<Appointment[] | null>(null);

  useEffect(() => {
    const start = todayIso();
    const end = addDaysIso(start, 13);
    api.appointmentsCalendar(start, end).then(setCalendar).catch(() => setCalendar({}));
    api.appointments({ from: start, to: end }).then(setList).catch(() => setList([]));
  }, []);

  const range = useMemo(() => {
    const start = todayIso();
    return { start, end: addDaysIso(start, 6) };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-ink-900">Appointments</h2>
          <p className="text-sm text-ink-500">Calendar and list of upcoming bookings.</p>
        </div>
        <div className="inline-flex rounded-lg border border-ink-100 bg-white p-1 text-sm">
          <button
            onClick={() => setView("calendar")}
            className={`rounded-md px-3 py-1.5 font-medium ${view === "calendar" ? "bg-primary-600 text-white" : "text-ink-700"}`}
          >
            Calendar
          </button>
          <button
            onClick={() => setView("list")}
            className={`rounded-md px-3 py-1.5 font-medium ${view === "list" ? "bg-primary-600 text-white" : "text-ink-700"}`}
          >
            List
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        calendar ? (
          <AppointmentsCalendar
            calendar={calendar}
            rangeStart={range.start}
            rangeEnd={range.end}
          />
        ) : (
          <Card className="p-6 text-sm text-ink-500">Loading…</Card>
        )
      ) : list && list.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-100/50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Doctor</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {list.map((a) => (
                  <tr key={a.id} className="hover:bg-ink-100/40">
                    <td className="px-4 py-3 font-medium text-ink-900">
                      {formatDateTime(a.starts_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900">{a.patient_name}</div>
                      <div className="text-xs text-ink-500">{formatPhone(a.patient_phone)}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{a.doctor_name}</td>
                    <td className="px-4 py-3 text-ink-700">{a.reason || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={a.status === "cancelled" ? "bad" : a.status === "booked" ? "good" : "neutral"}>
                        {a.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-sm text-ink-500">No appointments in this range.</Card>
      )}
    </div>
  );
}
