"use client";

import { useEffect, useState } from "react";
import { api, type Call, type CallTurn } from "@/lib/api";
import { CallsTable } from "@/components/dashboard/CallsTable";
import { Card, Badge, Button } from "@/components/ui";
import { formatDateTime, formatPhone, outcomeLabel } from "@/lib/format";

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [open, setOpen] = useState<Call | null>(null);

  useEffect(() => {
    api.calls(100).then(setCalls).catch(() => setCalls([]));
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("open"));
    if (id) setOpenId(id);
  }, []);

  useEffect(() => {
    if (openId) api.call(openId).then(setOpen).catch(() => setOpen(null));
  }, [openId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink-900">Calls</h2>
        <p className="text-sm text-ink-500">All calls handled by the AI receptionist. Click a row to see the full transcript.</p>
      </div>

      {calls === null ? (
        <Card className="p-6 text-sm text-ink-500">Loading…</Card>
      ) : (
        <CallsTable calls={calls} />
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 md:items-center"
          onClick={() => setOpen(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-ink-900">Call #{open.id}</div>
                <div className="text-xs text-ink-500">
                  {open.patient_name || "Unknown caller"}
                  {open.patient_phone && ` · ${formatPhone(open.patient_phone)}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={outcomeLabel(open.outcome).tone}>{outcomeLabel(open.outcome).label}</Badge>
                <Button variant="ghost" onClick={() => setOpen(null)}>✕</Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-5">
              <div className="mb-3 text-xs text-ink-500">
                {formatDateTime(open.started_at)} · {open.language === "te" ? "Telugu" : "English"}
              </div>
              {open.summary && (
                <div className="mb-4 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">
                  <span className="font-semibold">Summary: </span>
                  {open.summary}
                </div>
              )}
              <div className="space-y-3">
                {open.transcript.map((t: CallTurn, i) => (
                  <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                        t.role === "user"
                          ? "bg-primary-600 text-white"
                          : t.role === "system"
                          ? "bg-ink-100 text-ink-500 italic"
                          : "bg-ink-100 text-ink-900"
                      }`}
                    >
                      {t.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
