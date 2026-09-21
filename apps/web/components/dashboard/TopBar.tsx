"use client";

import { formatDay, todayIso } from "@/lib/format";

export function TopBar({ clinicName }: { clinicName: string }) {
  const today = formatDay(todayIso());
  return (
    <div className="flex items-center justify-between border-b border-ink-100 bg-white px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">{clinicName}</h1>
        <p className="text-xs text-ink-500">{today} · Asia/Kolkata</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-600" />
        </span>
        <span className="text-sm font-medium text-ink-700">AI agent online</span>
      </div>
    </div>
  );
}
