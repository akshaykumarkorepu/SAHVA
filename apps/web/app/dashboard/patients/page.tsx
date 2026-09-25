"use client";

import * as React from "react";
import { useApi } from "@/lib/hooks";
import type { Paged, Patient } from "@/lib/types";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { formatDate, formatPhone, LANGUAGE_LABEL } from "@/lib/format";

export default function PatientsPage() {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const list = useApi<Paged<Patient>>(
    `/patients?limit=100${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`,
    [debounced],
  );

  // One handset often covers a whole family, so group by number rather than
  // showing what looks like duplicate records.
  const groups = React.useMemo(() => {
    const byPhone = new Map<string, Patient[]>();
    for (const p of list.data?.data ?? []) {
      const list_ = byPhone.get(p.phone_e164) ?? [];
      list_.push(p);
      byPhone.set(p.phone_e164, list_);
    }
    return [...byPhone.entries()];
  }, [list.data]);

  return (
    <>
      <PageHeader title="Patients" subtitle="Search by name or phone number." />

      <div className="mb-4 max-w-sm">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Lakshmi, or +919885512345"
          aria-label="Search patients"
        />
      </div>

      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="◉"
          title={debounced ? "No patients match that" : "No patients yet"}
          body="Patients are created automatically the first time they call."
        />
      ) : (
        <div className="space-y-3">
          {groups.map(([phone, people]) => (
            <Card key={phone} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">{formatPhone(phone)}</p>
                {people.length > 1 && (
                  <Badge tone="info">{people.length} patients on this number</Badge>
                )}
              </div>
              <div className="mt-3 divide-y divide-ink-100">
                {people.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{p.full_name}</p>
                      <p className="truncate text-xs text-ink-500">
                        {p.approx_age_years ? `${p.approx_age_years} yrs · ` : ""}
                        {LANGUAGE_LABEL[p.preferred_language]} · since{" "}
                        {formatDate(p.created_at)}
                      </p>
                    </div>
                    {p.is_blocked && <Badge tone="bad">Blocked</Badge>}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
