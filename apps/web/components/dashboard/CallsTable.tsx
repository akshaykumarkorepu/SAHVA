"use client";

import Link from "next/link";
import { Card, Badge } from "../ui";
import type { Call } from "@/lib/api";
import { formatDateTime, formatPhone, outcomeLabel } from "@/lib/format";

export function CallsTable({ calls, dense = false }: { calls: Call[]; dense?: boolean }) {
  if (calls.length === 0) {
    return (
      <Card className="p-6 text-sm text-ink-500">
        No calls yet. <Link href="/call" className="font-medium text-primary-700 hover:underline">Start a demo call</Link> to populate this list.
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-100 bg-ink-100/50 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">Patient</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">Language</th>
              <th className="px-4 py-3 font-medium">When</th>
              {!dense && <th className="px-4 py-3 font-medium">Summary</th>}
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {calls.map((c) => {
              const oc = outcomeLabel(c.outcome);
              return (
                <tr key={c.id} className="hover:bg-ink-100/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">
                      {c.patient_name || "Unknown caller"}
                    </div>
                    {c.patient_phone && (
                      <div className="text-xs text-ink-500">{formatPhone(c.patient_phone)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={oc.tone}>{oc.label}</Badge>
                    {c.was_missed_before_ai === 1 && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-ink-500">
                        recovered
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {c.language === "te" ? "Telugu" : c.language === "en" ? "English" : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{formatDateTime(c.started_at)}</td>
                  {!dense && (
                    <td className="max-w-xs truncate px-4 py-3 text-ink-700">{c.summary || "—"}</td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/calls?open=${c.id}`}
                      className="text-xs font-medium text-primary-700 hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
