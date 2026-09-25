"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi, useMutation } from "@/lib/hooks";
import { post } from "@/lib/api";
import type { RescheduleBatch } from "@/lib/types";
import { useSession } from "@/lib/session";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Modal,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { formatDateTime, formatPhone, LANGUAGE_LABEL } from "@/lib/format";

/**
 * Reschedule batch review — the trust mechanism made visible.
 *
 * The database opened this batch in DRAFT when a doctor was marked unavailable.
 * Nothing has been sent and nobody has been cancelled. A named human reviews
 * the affected patients and presses send once; a CHECK constraint on
 * reschedule_batches rejects the transition without a dispatcher, so this step
 * cannot be skipped by any client.
 */
export default function BatchPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { clinic, email } = useSession();
  const tz = clinic?.timezone;
  const { data, error, loading, reload } = useApi<RescheduleBatch>(
    `/actions/batches/${params.id}`,
  );
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const dispatch = useMutation(() => post(`/actions/batches/${params.id}/dispatch`));

  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const isDraft = data.status === "draft";

  return (
    <>
      <PageHeader
        title="Reschedule review"
        subtitle={`${data.doctors?.spoken_name ?? "Doctor"} is unavailable — ${
          data.total_affected
        } appointment${data.total_affected === 1 ? "" : "s"} affected.`}
        action={
          <Link href="/dashboard/actions">
            <Button variant="ghost">← Back to queue</Button>
          </Link>
        }
      />

      <Card className="mb-6 p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Unavailable from</dt>
            <dd className="mt-1 text-sm font-medium text-ink-900">
              {formatDateTime(data.window_start, tz)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Until</dt>
            <dd className="mt-1 text-sm font-medium text-ink-900">
              {formatDateTime(data.window_end, tz)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Reason</dt>
            <dd className="mt-1 text-sm font-medium text-ink-900">{data.reason_note ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      {isDraft ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-medium text-amber-900">
            Nothing has been sent, and no appointment has been cancelled.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            These patients still hold their original slot. Review the list below, then send the
            reschedule message. Sending is recorded against your account.
          </p>
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-primary-100 bg-primary-50 px-5 py-4">
          <p className="text-sm font-medium text-primary-800">
            Dispatched {data.dispatched_at ? formatDateTime(data.dispatched_at, tz) : ""} ·{" "}
            {data.notified_count} notified · {data.rebooked_count} rebooked
          </p>
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-100 bg-ink-100/40 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">Patient</th>
              <th className="px-4 py-3 font-medium">Original slot</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Language</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {data.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink-900">{item.patients?.full_name ?? "—"}</p>
                  <p className="text-xs text-ink-500">
                    {formatPhone(item.patients?.phone_e164 ?? null)}
                  </p>
                </td>
                <td className="px-4 py-3 text-ink-700">
                  {item.appointments ? formatDateTime(item.appointments.starts_at, tz) : "—"}
                </td>
                <td className="hidden px-4 py-3 text-ink-700 sm:table-cell">
                  {item.patients ? LANGUAGE_LABEL[item.patients.preferred_language] : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      item.status === "rebooked"
                        ? "good"
                        : item.status === "unreachable"
                          ? "bad"
                          : item.status === "notified"
                            ? "info"
                            : "neutral"
                    }
                  >
                    {item.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {isDraft && (
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setConfirmOpen(true)} disabled={data.items.length === 0}>
            Send reschedule messages
          </Button>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Send to these patients?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={dispatch.pending}
              onClick={async () => {
                const ok = await dispatch.run();
                setConfirmOpen(false);
                if (ok) {
                  reload();
                  router.refresh();
                }
              }}
            >
              {dispatch.pending ? "Sending…" : `Send to ${data.items.length}`}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          {data.items.length} patient{data.items.length === 1 ? "" : "s"} will receive a message
          in their own language asking them to call the clinic for a new time.
        </p>
        <p className="mt-3 text-sm text-ink-500">
          This is recorded against <span className="font-medium text-ink-700">{email}</span> and
          cannot be undone. Patients are not cancelled — they are asked to rebook.
        </p>
        {dispatch.error && (
          <div className="mt-4">
            <ErrorState error={dispatch.error} />
          </div>
        )}
      </Modal>
    </>
  );
}
