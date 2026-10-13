"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { isMockMode } from "@/lib/mock/flag";
import { Button, Field, Input, Segmented, Spinner, cn } from "@/components/ui";
import { PRICE } from "@/lib/pricing";
import { toIndianE164 } from "@/lib/phone";
import { Icon } from "@/components/icons";
import { PageLoader } from "@/components/HeartLoader";
import { homeFor, whoami } from "@/lib/accountHome";

/**
 * After a password check (or on arriving already signed in), go where this
 * account belongs — staff to the dashboard, patients to /me — whatever tab
 * was selected or `next` was in the address. Admins are told to use the
 * admin console. Returns an error message to show, if any.
 */
async function goHome(router: { replace: (to: string) => void }, next: string | null): Promise<string | null> {
  let who;
  try {
    who = await whoami();
  } catch {
    return "Signed in, but your account could not be checked. Please refresh the page.";
  }
  const to = homeFor(who.kind, next);
  if (!to) {
    await supabase.auth.signOut();
    return "This is a SAHVA admin account. Sign in on the admin console instead.";
  }
  router.replace(to);
  return null;
}

/**
 * One door for everyone.
 *
 * There used to be two sign-in links in the header — "Patient sign in" and
 * "Staff sign in" — which is an implementation detail leaking into the product.
 * A person knows who they are; the page can ask. Role is a toggle here that
 * only changes the wording and the sign-up form: where you land after signing
 * in is decided by what the account is (lib/accountHome.ts), never the tab.
 *
 * Staff cannot self-register: `enable_signup = false` in supabase/config.toml,
 * because a clinic's staff list is not something a stranger should be able to
 * add themselves to. The sign-up panel says so rather than offering a form that
 * would fail.
 */

type Role = "patient" | "staff";
type Mode = "signin" | "signup";

const HOME: Record<Role, string> = { patient: "/me", staff: "/dashboard" };

export default function SignInPage() {
  return (
    <React.Suspense fallback={<CentredSpinner />}>
      <AuthScreen />
    </React.Suspense>
  );
}

function CentredSpinner() {
  return <PageLoader />;
}

function AuthScreen() {
  const router = useRouter();
  const params = useSearchParams();

  const [role, setRole] = React.useState<Role>(
    params.get("role") === "staff" ? "staff" : "patient",
  );
  const [mode, setMode] = React.useState<Mode>(
    params.get("mode") === "signup" ? "signup" : "signin",
  );

  const next = params.get("next") || HOME[role];
  const requested = params.get("next");

  // Already signed in: go where this account belongs, not where the tab says.
  React.useEffect(() => {
    if (isMockMode) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void goHome(router, requested);
    });
  }, [router, requested]);

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-surface px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(42rem_26rem_at_12%_-8%,rgb(var(--brand-500)/0.12),transparent_60%),radial-gradient(34rem_22rem_at_94%_104%,rgb(var(--accent-amber)/0.08),transparent_60%)]"
      />

      <Link
        href="/"
        className="absolute left-4 top-4 z-30 inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-ink"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        Back
      </Link>

      <AuthCard role={role} setRole={setRole} mode={mode} setMode={setMode} next={next} requested={requested} />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* The card                                                                    */
/* -------------------------------------------------------------------------- */

function AuthCard({
  role,
  setRole,
  mode,
  setMode,
  next,
  requested,
}: {
  role: Role;
  setRole: (r: Role) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  next: string;
  requested: string | null;
}) {
  const signup = mode === "signup";

  return (
    <div className="relative z-10 w-full max-w-[960px]">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-raised shadow-lift lg:h-[640px]">
        {/*
          Desktop: two half-width layers that slide past each other. Mobile:
          the overlay is hidden entirely and one form shows at a time, because
          a sliding panel on a 375px screen is a novelty, not a navigation.
        */}
        <div
          className={cn(
            "relative z-10 w-full transition-transform duration-700 ease-spring lg:absolute lg:inset-y-0 lg:left-0 lg:w-1/2",
            signup && "lg:translate-x-full",
          )}
        >
          <Panel active={!signup}>
            <SignInForm role={role} setRole={setRole} next={next} requested={requested} onSwitch={() => setMode("signup")} />
          </Panel>
          <Panel active={signup}>
            <SignUpForm role={role} setRole={setRole} next={next} onSwitch={() => setMode("signin")} />
          </Panel>
        </div>

        {/*
          Mutually exclusive, not "base + override".
          `cn` is a plain join with no tailwind-merge, so emitting both
          `left-1/2` and `left-0` leaves the winner to stylesheet order — and
          Tailwind writes `.left-0` before `.left-1/2`, so the override lost
          and the overlay never moved. The form then slid underneath it and the
          sign-up panel looked blank.
        */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-y-0 z-20 hidden w-1/2 overflow-hidden transition-[left] duration-700 ease-spring lg:block",
            signup ? "left-0" : "left-1/2",
          )}
        >
          <div className="relative h-full bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700">
            <div
              className="absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 20%, rgba(255,255,255,.55) 0, transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,.35) 0, transparent 40%)",
              }}
            />
            <OverlayPanel active={!signup}>
              <h2 className="font-display text-display-md text-white">New here?</h2>
              <p className="mt-3 max-w-[280px] text-[15px] leading-relaxed text-white/85">
                Create a patient account to see your appointments, prescriptions and medical
                history in Telugu or English.
              </p>
              <OverlayButton onClick={() => setMode("signup")}>Create an account</OverlayButton>
            </OverlayPanel>
            <OverlayPanel active={signup}>
              <h2 className="font-display text-display-md text-white">Already with us?</h2>
              <p className="mt-3 max-w-[280px] text-[15px] leading-relaxed text-white/85">
                Sign in to pick up where you left off.
              </p>
              <OverlayButton onClick={() => setMode("signin")}>Sign in</OverlayButton>
            </OverlayPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "w-full flex-col px-6 py-10 transition-opacity duration-500 sm:px-12 lg:absolute lg:inset-0 lg:flex lg:overflow-y-auto",
        // Below lg only one panel exists at a time, so display is the switch.
        // At lg both are mounted and stacked, so opacity is.
        active ? "flex opacity-100" : "hidden opacity-0 lg:pointer-events-none",
      )}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

function OverlayPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center px-10 text-center transition-all duration-500",
        active ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
      )}
    >
      {children}
    </div>
  );
}

function OverlayButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-8 inline-flex h-11 items-center justify-center rounded-xl border-2 border-white/70 px-7 text-sm font-semibold text-white transition duration-200 ease-spring hover:bg-white hover:text-brand-700 active:scale-[.97]"
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                 */
/* -------------------------------------------------------------------------- */

function Brand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center lg:text-left">
      <span
        aria-hidden
        className="inline-grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-lg font-extrabold text-white"
      >
        S
      </span>
      <h1 className="mt-5 font-display text-display-md text-ink">{title}</h1>
      <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>
    </div>
  );
}

function RoleToggle({ role, setRole }: { role: Role; setRole: (r: Role) => void }) {
  return (
    <div className="mt-6">
      <Segmented<Role>
        className="w-full [&>button]:flex-1"
        value={role}
        onChange={setRole}
        options={[
          { value: "patient", label: "Patient" },
          { value: "staff", label: "Clinic staff" },
        ]}
      />
    </div>
  );
}

function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-surface-raised text-sm font-semibold text-ink transition duration-200 ease-spring hover:bg-surface-sunken active:scale-[.98] disabled:pointer-events-none disabled:opacity-50"
    >
      <GoogleMark />
      Continue with Google
    </button>
  );
}

/** Google's mark, inline — lucide has no brand logos. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-[18px] w-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        {children}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function Alert({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "mt-4 flex gap-2.5 rounded-xl border p-3 text-[13px] leading-relaxed",
        tone === "error"
          ? "border-accent-rose/30 bg-accent-rose/[0.07] text-ink"
          : "border-accent-sky/30 bg-accent-sky/[0.07] text-ink",
      )}
    >
      <Icon
        name={tone === "error" ? "warning" : "shield"}
        className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "error" ? "text-accent-rose" : "text-accent-sky")}
      />
      <span>{children}</span>
    </div>
  );
}

/** Shown on both panels when there is no Supabase to talk to. */
function useAuthAvailability() {
  if (isMockMode) return { ok: false as const, reason: "mock" as const };
  if (!isSupabaseConfigured) return { ok: false as const, reason: "unconfigured" as const };
  return { ok: true as const, reason: null };
}

/**
 * Off unless the Google provider is configured in Supabase. A button that
 * leads to "provider is not enabled" is worse than no button.
 */
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

async function signInWithGoogle(next: string) {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
}

/* -------------------------------------------------------------------------- */
/* Sign in                                                                     */
/* -------------------------------------------------------------------------- */

function SignInForm({
  role,
  setRole,
  next,
  requested,
  onSwitch,
}: {
  role: Role;
  setRole: (r: Role) => void;
  next: string;
  requested: string | null;
  onSwitch: () => void;
}) {
  const router = useRouter();
  const avail = useAuthAvailability();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!avail.ok) return router.replace(next);
    setPending(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      // A lockout is not a typo. Telling someone to recheck a password they
      // typed correctly just burns more attempts against the limit.
      if (authError.status === 429) {
        setError("Too many attempts. Wait a few minutes, then try again.");
        setPending(false);
        return;
      }
      // Not distinguishing "no such account" from "wrong password" — that
      // difference tells an attacker which emails are registered.
      setError("That email and password did not match.");
      setPending(false);
      return;
    }
    const problem = await goHome(router, requested);
    if (problem) {
      setError(problem);
      setPending(false);
    }
  }

  return (
    <div className="mx-auto my-auto w-full max-w-sm">
      <Brand title="Welcome back" subtitle="Sign in to continue." />
      <RoleToggle role={role} setRole={setRole} />

      {avail.ok ? (
        GOOGLE_ENABLED && (
          <>
            <GoogleButton onClick={() => void signInWithGoogle(next)} />
            <Divider>or</Divider>
          </>
        )
      ) : avail.reason === "mock" ? (
        <Alert tone="info">
          Mock mode — fixtures only, no sign-in. Continue to see the{" "}
          {role === "staff" ? "dashboard" : "patient record"}.
        </Alert>
      ) : (
        <Alert tone="error">
          Supabase is not configured. Set the <code>NEXT_PUBLIC_SUPABASE_*</code> variables and
          restart — see <code>docs/setup.md</code>.
        </Alert>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <Field label="Email" required>
          <Input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="text-base"
          />
        </Field>

        <Field label="Password" required>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-11 text-base"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-subtle transition hover:text-ink"
            >
              <Icon name={show ? "eyeOff" : "eye"} className="h-4 w-4" />
            </button>
          </div>
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-[13px] font-medium text-brand-700 transition hover:text-brand-600"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {avail.ok ? "Sign in" : "Continue"}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-muted lg:hidden">
        New here?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-brand-700">
          Create an account
        </button>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sign up                                                                     */
/* -------------------------------------------------------------------------- */

function SignUpForm({
  role,
  setRole,
  next,
  onSwitch,
}: {
  role: Role;
  setRole: (r: Role) => void;
  next: string;
  onSwitch: () => void;
}) {
  const router = useRouter();
  const avail = useAuthAvailability();
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const staff = role === "staff";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!avail.ok) return router.replace(staff ? "/dashboard" : next);
    // The staff profile stores E.164 and refuses anything else — which would
    // surface as Supabase's opaque "Database error saving new user".
    const e164 = staff ? toIndianE164(phone) : phone;
    if (staff && !e164) {
      setError("Enter a 10-digit mobile number, like 98765 43210.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // account_type "staff" is what makes the database create a staff
        // profile; a clinic owner then sets up their clinic after confirming.
        // Patients never send it, so they never acquire a staff identity.
        data: staff
          ? { full_name: fullName, phone: e164, account_type: "staff" }
          : { full_name: fullName, phone_e164: phone },
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(staff ? "/dashboard" : next)}`,
      },
    });
    setPending(false);
    if (authError) {
      setError(
        authError.status === 429
          ? "Too many confirmation emails have been sent in the last hour. Please try again in an hour."
          : authError.message,
      );
      return;
    }
    setSent(true);
  }

  return (
    <div className="mx-auto my-auto w-full max-w-sm">
      <Brand
        title={staff ? `Start your ${PRICE.trialDays}-day free trial` : "Create your account"}
        subtitle={staff ? "For clinic owners. No card needed." : "See your records in Telugu or English."}
      />
      <RoleToggle role={role} setRole={setRole} />

      {staff && !sent && (
        <p className="mb-4 rounded-xl bg-surface-sunken px-3 py-2 text-[13px] text-ink-muted">
          Joining an existing clinic? Ask its owner to invite you from <strong>Settings → Staff</strong> instead.
        </p>
      )}

      {!staff && avail.ok ? (
        <PatientSignupFromLink />
      ) : sent ? (
        <Alert tone="info">
          Check <strong>{email}</strong> for a confirmation link.
          {staff ? " After confirming, you will set up your clinic and your trial starts." : " You can close this page."}
        </Alert>
      ) : (
        <>
          {avail.ok ? (
            GOOGLE_ENABLED && (
              <>
                <GoogleButton onClick={() => void signInWithGoogle(next)} />
                <Divider>or</Divider>
              </>
            )
          ) : avail.reason === "mock" ? (
            <Alert tone="info">
              Mock mode — fixtures only. Continue to the {staff ? "dashboard" : "patient record"}.
            </Alert>
          ) : (
            <Alert tone="error">Supabase is not configured — see docs/setup.md.</Alert>
          )}

          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <Field label="Full name" required>
              <Input
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="text-base"
              />
            </Field>

            <Field label="Mobile number" hint={staff ? "Yours, not the clinic's" : "The number the clinic has on file"} required>
              <Input
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="text-base"
              />
            </Field>

            <Field label="Email" required>
              <Input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-base"
              />
            </Field>

            <Field label="Password" hint="At least 8 characters" required>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-11 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-subtle transition hover:text-ink"
                >
                  <Icon name={show ? "eyeOff" : "eye"} className="h-4 w-4" />
                </button>
              </div>
            </Field>

            {error && <Alert tone="error">{error}</Alert>}

            <Button type="submit" size="lg" className="w-full" loading={pending}>
              {avail.ok ? (staff ? "Start free trial" : "Create account") : "Continue"}
            </Button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-[13px] text-ink-muted lg:hidden">
        Already have an account?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-brand-700">
          Sign in
        </button>
      </p>
    </div>
  );
}

/**
 * Patients do not sign up with an email confirmation. A patient account must
 * belong to a patient record, and the only proof that someone is that patient
 * is the link their clinic sends to the phone on file. So the account is
 * created from that link (/p/<link> → "Create account"), with no email to
 * wait for. This panel says so, and opens a pasted link.
 */
function PatientSignupFromLink() {
  const router = useRouter();
  const [link, setLink] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function open(e: React.FormEvent) {
    e.preventDefault();
    const m = link.trim().match(/(?:\/p\/)?([A-Za-z0-9_-]{40,50})\/?$/);
    if (!m) return setError("That does not look like a SAHVA link. Copy the whole link from the clinic's message.");
    router.push(`/p/${m[1]}`);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface-sunken p-4 text-sm text-ink">
        <p className="font-semibold">Your clinic sends you a link</p>
        <p className="mt-1 text-ink-muted">
          When you book, the clinic sends a link on WhatsApp or SMS. Open it and tap <strong>Create account</strong> —
          no email code needed.
        </p>
        <p lang="te" className="mt-2 text-ink-muted">
          క్లినిక్ పంపిన లింక్‌ను తెరిచి <strong>ఖాతా సృష్టించండి</strong> నొక్కండి.
        </p>
      </div>
      <form onSubmit={open} className="space-y-3">
        <Field label="Have the link? Paste it here">
          <Input value={link} onChange={(e) => { setLink(e.target.value); setError(null); }} placeholder="https://…/p/…" />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" disabled={!link.trim()}>
          Open my link
        </Button>
      </form>
      <p className="text-center text-xs text-ink-subtle">No link? Ask your clinic&rsquo;s front desk to send one.</p>
    </div>
  );
}
