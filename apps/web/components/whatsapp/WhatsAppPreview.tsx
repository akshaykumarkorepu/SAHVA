"use client";

import { useState } from "react";
import type { WhatsAppPreview } from "@/lib/api";
import { formatDateTime, formatPhone } from "@/lib/format";
import { Card, Button } from "../ui";

/**
 * WhatsApp message preview — mimics the real WhatsApp chat surface so the
 * demo sells the "confirmation sent to the patient" feature visually.
 * No real WhatsApp API is called.
 */
export function WhatsAppPreview({ preview }: { preview: WhatsAppPreview | null }) {
  const [open, setOpen] = useState(false);
  if (!preview) return null;

  // Render newlines as <br/>
  const lines = preview.message.split("\n");

  return (
    <>
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              ✓ Confirmation sent
            </div>
            <div className="mt-1 text-sm text-ink-700">
              WhatsApp message to {formatPhone(preview.to)}
            </div>
          </div>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Preview
          </Button>
        </div>
        <div className="rounded-lg bg-[#ece5dd] p-3" style={{ background: "#d9fdd3" }}>
          <div className="mb-1 max-w-[85%] rounded-lg bg-white p-2 text-sm text-ink-900 shadow-sm">
            {lines.map((l, i) => (
              <p key={i} className={l.startsWith("*") ? "font-semibold" : undefined}>
                {l.replace(/^\*|\*$/g, "")}
              </p>
            ))}
            <div className="mt-1 text-right text-[10px] text-ink-500">
              {formatDateTime(preview.sent_at)}
            </div>
          </div>
        </div>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#efeae2] shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 bg-primary-600 px-4 py-3 text-white">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm">
                👤
              </div>
              <div>
                <div className="text-sm font-semibold">{preview.patient_name}</div>
                <div className="text-[11px] opacity-80">{formatPhone(preview.to)}</div>
              </div>
              <button
                className="ml-auto text-lg"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 p-4">
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg bg-white px-3 py-2 text-sm text-ink-900 shadow-sm">
                  {lines.map((l, i) => (
                    <p key={i} className={l.startsWith("*") ? "text-sm font-semibold" : undefined}>
                      {l.replace(/^\*|\*$/g, "")}
                    </p>
                  ))}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-ink-500">
                    {formatDateTime(preview.sent_at)}
                    <span className="text-primary-600">✓✓</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-ink-100 bg-[#f0f2f5] px-4 py-2 text-xs text-ink-500">
              This is a demo preview. The real message would be delivered via the WhatsApp
              Business API.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
