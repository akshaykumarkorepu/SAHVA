"use client";

import * as React from "react";
import { useRequirePatient } from "@/lib/portal/session";
import { useApi } from "@/lib/hooks";
import { STRINGS, type Lang } from "@/lib/portal/i18n";
import { Button, ErrorState, LoadingRows, Segmented, Spinner, cn } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { CareTask, Invoice, Medical, Tab } from "@/components/patient/types";
import { amountOwed, buildTiles, isActiveRx } from "@/components/patient/logic";
import { PatientHeader } from "@/components/patient/PatientHeader";
import { AppointmentHero, NoAppointment, QuickActions } from "@/components/patient/AppointmentHero";
import { StatRow } from "@/components/patient/StatRow";
import { CareTasksList } from "@/components/patient/CareTasksList";
import { ClinicCard, ConditionsCard, PrivacyNote } from "@/components/patient/Sidebar";
import { TabPanel } from "@/components/patient/RecordTabs";

/**
 * The signed-in patient's record.
 *
 * Reachable only with a password, never with a portal link — a forwarded
 * WhatsApp message must not expose a diagnosis. Phone-first, but it now also
 * uses the width when there is width: a single narrow column on a laptop made
 * a real record look like an empty app.
 */
export default function PatientHomePage() {
  const { status, me, error, signOut } = useRequirePatient();
  const [lang, setLang] = React.useState<Lang>("te");
  const [tab, setTab] = React.useState<Tab>("overview");

  const ready = status === "ready";
  const medical = useApi<Medical>(ready ? "/me/medical" : null, [status]);
  const tasks = useApi<CareTask[]>(ready ? "/me/tasks" : null, [status]);
  const invoices = useApi<Invoice[]>(ready ? "/me/invoices" : null, [status]);

  React.useEffect(() => {
    if (me?.patient.preferred_language) {
      setLang(me.patient.preferred_language === "te" ? "te" : "en");
    }
  }, [me?.patient.preferred_language]);

  const t = STRINGS[lang];
  const L = lang === "te";

  if (status === "loading" || status === "signed-out") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-surface">
        <Spinner />
      </div>
    );
  }

  if (status === "not-a-patient") {
    return (
      <Centred>
        <Icon name="warning" className="mx-auto h-8 w-8 text-accent-amber" />
        <p className="mt-4 font-semibold text-ink">
          {L
            ? "ఈ ఖాతా ఏ రోగి రికార్డుతో అనుసంధానించబడలేదు"
            : "This account is not linked to a patient record"}
        </p>
        <p className="mt-2 text-sm text-ink-muted">{error}</p>
        <Button variant="secondary" className="mt-5" onClick={signOut}>
          {L ? "సైన్ అవుట్" : "Sign out"}
        </Button>
      </Centred>
    );
  }

  // Without this branch the page falls through every guard and renders an empty
  // body — the staff shell handles "unconfigured", the patient surface did not.
  if (status === "unconfigured") {
    return (
      <Centred tone="amber">
        <Icon name="warning" className="mx-auto h-8 w-8 text-accent-amber" />
        <p className="mt-4 font-semibold text-ink">Supabase is not configured</p>
        <p className="mt-2 text-sm text-ink-muted">
          Set the <code className="font-mono text-[12px] text-ink">NEXT_PUBLIC_SUPABASE_*</code>{" "}
          variables and restart. See{" "}
          <code className="font-mono text-[12px] text-ink">docs/setup.md</code>.
        </p>
      </Centred>
    );
  }

  if (!me) return null;

  const next = me.upcoming[0] ?? null;
  const conditions = (medical.data?.conditions ?? []).filter((c) => c.status !== "resolved");
  const activeRx = (medical.data?.prescriptions ?? []).filter(isActiveRx);
  const vaccinesDue = (medical.data?.vaccinations ?? []).filter(
    (v) => v.status === "due" || v.status === "overdue",
  );
  const openTasks = tasks.data ?? [];
  const owed = amountOwed(invoices.data ?? []);

  const tabs: { value: Tab; label: string }[] = [
    { value: "overview", label: L ? "సారాంశం" : "Overview" },
    { value: "visits", label: L ? "వైద్య చరిత్ర" : "Visits" },
    { value: "medicines", label: L ? "మందులు" : "Medicines" },
    { value: "vaccines", label: L ? "టీకాలు" : "Vaccines" },
    { value: "bills", label: L ? "బిల్లులు" : "Bills" },
  ];

  const loading = medical.loading || tasks.loading || invoices.loading;

  const tiles = buildTiles({ L, activeRx, vaccinesDue, owed, conditions });

  return (
    <main className="min-h-[100dvh] bg-surface pb-20">
      <PatientHeader
        name={me.patient.full_name}
        clinic={me.clinic.name}
        languageLabel={t.language}
        onToggleLang={() => setLang(L ? "en" : "te")}
        onSignOut={signOut}
        signOutLabel={L ? "సైన్ అవుట్" : "Sign out"}
      />

      <div className="mx-auto max-w-5xl px-4 pt-5 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_292px] lg:items-start">
          <div className="min-w-0 space-y-5">
            {next ? (
              <AppointmentHero appt={next} L={L} lang={lang} clinic={me.clinic} />
            ) : (
              <NoAppointment L={L} lang={lang} clinic={me.clinic} lastVisit={me.past[0] ?? null} />
            )}

            <QuickActions L={L} clinic={me.clinic} onJump={setTab} />

            {tiles.length > 0 && <StatRow L={L} stats={tiles} />}

            {openTasks.length > 0 && <CareTasksList tasks={openTasks} L={L} lang={lang} />}

            <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <Segmented options={tabs} value={tab} onChange={setTab} />
            </div>

            {loading ? (
              <LoadingRows rows={3} />
            ) : medical.error ? (
              <ErrorState error={medical.error} onRetry={medical.reload} />
            ) : (
              <TabPanel
                tab={tab}
                L={L}
                lang={lang}
                me={me}
                medical={medical.data}
                invoices={invoices.data ?? []}
                activeRx={activeRx}
              />
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            {conditions.length > 0 && <ConditionsCard conditions={conditions} L={L} />}
            <ClinicCard clinic={me.clinic} L={L} />
            <PrivacyNote L={L} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function Centred({ children, tone }: { children: React.ReactNode; tone?: "amber" }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-surface px-4">
      <div
        className={cn(
          "w-full max-w-sm rounded-3xl border p-8 text-center",
          tone === "amber"
            ? "border-accent-amber/25 bg-accent-amber/[0.07]"
            : "border-line bg-surface-raised",
        )}
      >
        {children}
      </div>
    </div>
  );
}
