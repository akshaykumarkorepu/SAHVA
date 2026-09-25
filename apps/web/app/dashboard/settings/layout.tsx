"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCanAdminister } from "@/lib/session";
import { EmptyState, PageHeader } from "@/components/ui";

const TABS = [
  { href: "/dashboard/settings", label: "AI permissions" },
  { href: "/dashboard/settings/doctors", label: "Doctors & schedule" },
  { href: "/dashboard/settings/hours", label: "Hours & closures" },
  { href: "/dashboard/settings/knowledge", label: "Knowledge base" },
  { href: "/dashboard/settings/staff", label: "Staff" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const canAdmin = useCanAdminister();

  if (!canAdmin) {
    return (
      <EmptyState
        icon="⚙"
        title="Settings are owner and manager only"
        body="Ask your clinic owner if something here needs changing."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Everything the AI receptionist knows and is allowed to do."
      />

      {/* Scrolls horizontally on a phone rather than wrapping into a stack. */}
      <div className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex w-max gap-1 border-b border-ink-100 md:w-full">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-ink-500 hover:text-ink-900"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      {children}
    </>
  );
}
