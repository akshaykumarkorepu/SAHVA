"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "../ui";

const items = [
  { href: "/dashboard", label: "Overview", icon: "▦" },
  { href: "/dashboard/calls", label: "Calls", icon: "☎" },
  { href: "/dashboard/appointments", label: "Appointments", icon: "📅" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "▰" },
];

export function Sidebar({ clinicName }: { clinicName: string }) {
  const path = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-100 bg-white px-4 py-6 md:flex">
      <Link href="/dashboard" className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
          <span className="text-lg">🩺</span>
        </div>
        <div>
          <div className="text-sm font-semibold text-ink-900">ClinicVoice</div>
          <div className="text-[11px] text-ink-500">{clinicName}</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((it) => {
          const active = path === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-primary-50 text-primary-700"
                  : "text-ink-700 hover:bg-ink-100"
              }`}
            >
              <span className="text-base">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </nav>

      <Card className="mt-6 bg-gradient-to-br from-primary-50 to-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">
          Live demo
        </div>
        <p className="mt-2 text-sm text-ink-700">
          Try the live voice receptionist. Book, reschedule, or cancel — in English or Telugu.
        </p>
        <Link
          href="/call"
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-soft hover:bg-primary-700"
        >
          Start demo call →
        </Link>
      </Card>
    </aside>
  );
}
