"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRequireAdmin } from "@/lib/admin/session";
import { Button, Spinner, cn } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

const NAV: { href: string; label: string; icon: IconName; soon?: boolean }[] = [
  { href: "/admin", label: "Overview", icon: "overview" },
  { href: "/admin/applications", label: "Applications", icon: "shield", soon: true },
  { href: "/admin/clinics", label: "Clinics", icon: "patients", soon: true },
  { href: "/admin/payments", label: "Payments", icon: "rupee", soon: true },
  { href: "/admin/audit", label: "Audit log", icon: "inbox" },
];

/**
 * The console's frame: same tokens and components as the clinic app, a dark
 * rail so nobody mistakes which side they are on.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { status, me, signOut } = useRequireAdmin();
  const pathname = usePathname();

  if (status !== "ready") {
    if (status === "not-admin") {
      return (
        <div className="grid min-h-dvh place-items-center bg-surface px-4">
          <div className="max-w-sm text-center">
            <p className="text-ink">This account is not a SAHVA admin.</p>
            <Button variant="secondary" className="mt-4" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="grid min-h-dvh place-items-center bg-surface">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-surface">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col bg-surface-inverse px-3 py-5 text-white lg:flex">
        <div className="flex items-center gap-2 px-2">
          <Icon name="shield" className="h-5 w-5" />
          <span className="font-display font-semibold">SAHVA Admin</span>
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-0.5">
          {NAV.map((n) =>
            n.soon ? (
              <span key={n.href} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/40">
                <Icon name={n.icon} className="h-4 w-4" />
                {n.label}
                <span className="ml-auto text-[10px] uppercase tracking-wider">Next</span>
              </span>
            ) : (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname === n.href ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                  pathname === n.href ? "bg-white/15 font-semibold" : "text-white/75 hover:bg-white/10",
                )}
              >
                <Icon name={n.icon} className="h-4 w-4" />
                {n.label}
              </Link>
            ),
          )}
        </nav>
        <div className="rounded-xl bg-white/10 p-3 text-xs">
          <p className="truncate font-medium">{me?.full_name}</p>
          <p className="truncate text-white/60">
            {me?.email} · {me?.role.replace("_", " ")}
          </p>
          <button type="button" onClick={() => void signOut()} className="mt-2 font-medium text-white/80 underline">
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-line px-5 py-3 lg:hidden">
          <span className="font-display font-semibold text-ink">SAHVA Admin</span>
          <nav className="flex gap-3 text-sm">
            {NAV.filter((n) => !n.soon).map((n) => (
              <Link key={n.href} href={n.href} className={pathname === n.href ? "font-semibold text-ink" : "text-ink-muted"}>
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1180px] px-5 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
