"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRequireSession } from "@/lib/session";
import { useActionCount } from "@/lib/hooks";
import { isActive, primaryNav, secondaryNav, visibleNav, type NavItem } from "./nav";
import { Logo } from "./Logo";
import { Icon } from "@/components/icons";
import { Button, Spinner, cn } from "@/components/ui";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * Application shell.
 *
 * Two distinct navigation shapes rather than one squeezed into both:
 *  - desktop gets a persistent rail
 *  - mobile gets a bottom tab bar, which is where a thumb actually reaches
 *
 * Both read the same definition in nav.ts, so they cannot drift.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, clinic, email, role, signOut } = useRequireSession();
  const pathname = usePathname();
  const count = useActionCount();
  const [moreOpen, setMoreOpen] = React.useState(false);

  React.useEffect(() => setMoreOpen(false), [pathname]);

  if (status === "unconfigured") return <SetupNeeded />;
  if (status === "loading" || status === "signed-out") return <BootScreen />;
  if (status === "no-clinic") return <NoClinic email={email} onSignOut={signOut} />;

  return (
    <div className="flex min-h-[100dvh] bg-surface">
      {/* ---------------- Desktop rail ---------------- */}
      <aside className="sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col border-r border-line bg-surface-raised px-3 py-5 lg:flex">
        <div className="px-2">
          <Logo subtitle={clinic?.name} />
        </div>

        <nav className="mt-7 flex flex-1 flex-col gap-0.5">
          {visibleNav(role).map((item) => (
            <RailLink key={item.href} item={item} active={isActive(pathname, item.href)} count={count} />
          ))}
        </nav>

        <AccountCard email={email} role={role} onSignOut={signOut} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---------------- Top bar ---------------- */}
        <header className="sticky top-0 z-30 border-b border-line glass">
          <div className="flex items-center gap-3 px-4 py-3 md:px-7">
            <div className="lg:hidden">
              <Logo compact />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-ink md:text-base">
                {clinic?.name ?? "—"}
              </h1>
              <p className="truncate text-[11px] text-ink-subtle md:text-xs">
                {clinic?.city}
                {clinic?.timezone ? ` · ${clinic.timezone}` : ""}
              </p>
            </div>

            <AiStatus enabled={clinic?.settings?.ai_enabled !== false} />
            <ThemeToggle />
          </div>
        </header>

        {/* pb-28 keeps content clear of the mobile tab bar */}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-7 lg:pb-10">
          <div className="mx-auto w-full max-w-[1180px]">{children}</div>
        </main>
      </div>

      {/* ---------------- Mobile tab bar ---------------- */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line glass pb-safe lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1.5">
          {primaryNav(role).map((item) => (
            <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} count={count} />
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            aria-expanded={moreOpen}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition",
              moreOpen ? "text-brand-600" : "text-ink-subtle",
            )}
          >
            <Icon name="menu" className="h-[22px] w-[22px]" />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <MoreSheet
          items={secondaryNav(role)}
          email={email}
          role={role}
          pathname={pathname}
          onClose={() => setMoreOpen(false)}
          onSignOut={signOut}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RailLink({ item, active, count }: { item: NavItem; active: boolean; count: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200 ease-spring",
        active ? "bg-brand-500/10 text-brand-700" : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
      )}
    >
      {/* Active indicator reads faster than colour alone. */}
      <span
        className={cn(
          "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600 transition-all duration-200",
          active ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.1 : 1.75} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge === "actions" && count > 0 && <CountPill count={count} />}
    </Link>
  );
}

function TabLink({ item, active, count }: { item: NavItem; active: boolean; count: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition duration-200",
        active ? "text-brand-600" : "text-ink-subtle",
      )}
    >
      <span className="relative">
        <Icon name={item.icon} className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.75} />
        {item.badge === "actions" && count > 0 && (
          <span className="absolute -right-2 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent-rose px-1 text-[10px] font-bold text-white ring-2 ring-surface-raised">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[10px] font-medium leading-none">
        {item.short ?? item.label}
      </span>
    </Link>
  );
}

function CountPill({ count }: { count: number }) {
  return (
    <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-accent-rose px-1.5 text-[11px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function AiStatus({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset",
        enabled
          ? "bg-brand-500/10 text-brand-700 ring-brand-500/20"
          : "bg-accent-amber/10 text-accent-amber ring-accent-amber/20",
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {enabled && (
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-500" />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            enabled ? "bg-brand-600" : "bg-accent-amber",
          )}
        />
      </span>
      <span className="hidden sm:inline">{enabled ? "AI online" : "AI paused"}</span>
    </span>
  );
}

function AccountCard({
  email,
  role,
  onSignOut,
}: {
  email: string | null;
  role: string | null;
  onSignOut: () => void;
}) {
  return (
    <div className="mt-auto rounded-2xl border border-line bg-surface-sunken/60 p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold uppercase text-white">
          {(email ?? "?").slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{email ?? "—"}</span>
          <span className="block truncate text-[11px] capitalize text-ink-subtle">{role ?? "—"}</span>
        </span>
      </div>
      <button
        onClick={onSignOut}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-muted transition hover:bg-surface-raised hover:text-ink"
      >
        <Icon name="signOut" className="h-4 w-4" />
        Sign out
      </button>
    </div>
  );
}

function MoreSheet({
  items,
  email,
  role,
  pathname,
  onClose,
  onSignOut,
}: {
  items: NavItem[];
  email: string | null;
  role: string | null;
  pathname: string;
  onClose: () => void;
  onSignOut: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-surface-inverse/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-surface-raised p-5 pb-safe shadow-lift animate-slide-up">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
        <nav className="grid gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition",
                isActive(pathname, item.href)
                  ? "bg-brand-500/10 text-brand-700"
                  : "text-ink hover:bg-surface-sunken",
              )}
            >
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
              {item.label}
              <Icon name="chevronRight" className="ml-auto h-4 w-4 text-ink-subtle" />
            </Link>
          ))}
        </nav>

        <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold uppercase text-white">
            {(email ?? "?").slice(0, 2)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{email ?? "—"}</span>
            <span className="block text-xs capitalize text-ink-subtle">{role ?? "—"}</span>
          </span>
          <Button variant="secondary" size="sm" icon="signOut" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function BootScreen() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-surface">
      <Spinner />
    </div>
  );
}

function NoClinic({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-surface px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface-raised p-8 text-center shadow-card animate-scale-in">
        <div className="pointer-events-none absolute inset-0 aurora" aria-hidden />
        <div className="relative">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-amber/12 text-accent-amber ring-1 ring-inset ring-accent-amber/20">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <h1 className="mt-4 font-display text-lg font-semibold tracking-tight text-ink">
            No clinic yet
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            <span className="font-medium text-ink">{email}</span> is signed in, but is not an active
            member of any clinic. An owner needs to invite this account before it can see any data.
          </p>
          <Button variant="secondary" onClick={onSignOut} className="mt-6" icon="signOut">
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

function SetupNeeded() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-surface px-4">
      <div className="w-full max-w-lg rounded-3xl border border-accent-amber/25 bg-accent-amber/[0.07] p-8 animate-scale-in">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-amber/12 text-accent-amber ring-1 ring-inset ring-accent-amber/20">
          <Icon name="warning" className="h-5 w-5" />
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold tracking-tight text-ink">
          Supabase is not configured
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Set <Code>NEXT_PUBLIC_SUPABASE_URL</Code> and <Code>NEXT_PUBLIC_SUPABASE_ANON_KEY</Code> in{" "}
          <Code>.env</Code>, then restart.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          See <Code>docs/setup.md</Code> — the project should be in{" "}
          <strong className="text-ink">ap-south-1 (Mumbai)</strong>.
        </p>
      </div>
    </div>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-[12px] text-ink">
    {children}
  </code>
);
