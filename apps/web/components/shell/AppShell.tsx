"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRequireSession } from "@/lib/session";
import { visibleNav } from "./nav";
import { useActionCount } from "@/lib/hooks";
import { Logo } from "./Logo";

function NavLinks({
  onNavigate,
  count,
}: {
  onNavigate?: () => void;
  count: number;
}) {
  const pathname = usePathname();
  const { role } = useRequireSession();

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {visibleNav(role).map((item) => {
        // Exact match for the index route, prefix match for the rest, so
        // /dashboard does not stay highlighted on every child page.
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-primary-50 text-primary-700"
                : "text-ink-700 hover:bg-ink-100"
            }`}
          >
            <span aria-hidden className="w-4 text-center text-base leading-none">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
            {item.badge === "actions" && count > 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, clinic, email, role, signOut } = useRequireSession();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const pathname = usePathname();
  const count = useActionCount();

  // Close the drawer on navigation, or it stays open over the new page.
  React.useEffect(() => setDrawerOpen(false), [pathname]);

  // Escape closes the drawer — expected of any modal surface.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  if (status === "unconfigured") return <SetupNeeded />;
  if (status === "loading" || status === "signed-out") return <FullPageSpinner />;
  if (status === "no-clinic") return <NoClinic email={email} onSignOut={signOut} />;

  return (
    <div className="flex min-h-screen bg-ink-100/40">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-100 bg-white px-4 py-6 md:flex">
        <Logo clinicName={clinic?.name} />
        <div className="mt-6 flex flex-1 flex-col">
          <NavLinks count={count} />
          <AccountBlock email={email} role={role} onSignOut={signOut} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-ink-900/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white px-4 py-6 shadow-soft">
            <Logo clinicName={clinic?.name} />
            <div className="mt-6 flex flex-1 flex-col">
              <NavLinks count={count} onNavigate={() => setDrawerOpen(false)} />
              <AccountBlock email={email} role={role} onSignOut={signOut} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-100 bg-white px-4 py-3 md:px-8">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="-ml-1 rounded-lg p-2 text-ink-700 hover:bg-ink-100 md:hidden"
          >
            <span aria-hidden className="block text-lg leading-none">☰</span>
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-ink-900 md:text-lg">
              {clinic?.name ?? "—"}
            </h1>
            <p className="truncate text-xs text-ink-500">
              {clinic?.city}
              {clinic?.timezone ? ` · ${clinic.timezone}` : ""}
            </p>
          </div>

          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              clinic?.settings?.ai_enabled === false
                ? "bg-amber-50 text-amber-700"
                : "bg-primary-50 text-primary-700"
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                clinic?.settings?.ai_enabled === false ? "bg-amber-500" : "bg-primary-600"
              }`}
            />
            <span className="hidden sm:inline">
              {clinic?.settings?.ai_enabled === false ? "AI paused" : "AI online"}
            </span>
          </span>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

function AccountBlock({
  email,
  role,
  onSignOut,
}: {
  email: string | null;
  role: string | null;
  onSignOut: () => void;
}) {
  return (
    <div className="mt-auto border-t border-ink-100 pt-4">
      <p className="truncate text-sm font-medium text-ink-900">{email ?? "—"}</p>
      <p className="text-xs capitalize text-ink-500">{role ?? "—"}</p>
      <button
        onClick={onSignOut}
        className="mt-3 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-100"
      >
        Sign out
      </button>
    </div>
  );
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100/40">
      <div
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-2 border-ink-300 border-t-primary-600"
      />
    </div>
  );
}

function NoClinic({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100/40 px-4">
      <div className="max-w-md rounded-xl border border-ink-100 bg-white p-8 text-center shadow-card">
        <p className="text-3xl" aria-hidden>🔑</p>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">No clinic yet</h1>
        <p className="mt-2 text-sm text-ink-500">
          <span className="font-medium text-ink-700">{email}</span> is signed in, but is not an
          active member of any clinic. An owner needs to invite this account before it can see
          any data.
        </p>
        <button
          onClick={onSignOut}
          className="mt-6 rounded-lg border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function SetupNeeded() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100/40 px-4">
      <div className="max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-8 shadow-card">
        <h1 className="text-lg font-semibold text-amber-900">Supabase is not configured</h1>
        <p className="mt-2 text-sm text-amber-800">
          Set <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
          <code className="rounded bg-amber-100 px-1">.env</code>, then restart.
        </p>
        <p className="mt-3 text-sm text-amber-800">
          See <code className="rounded bg-amber-100 px-1">docs/setup.md</code> — the project
          should be in <strong>ap-south-1 (Mumbai)</strong>.
        </p>
      </div>
    </div>
  );
}
