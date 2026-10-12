import type { TodayAppointment } from "@/lib/types";
import { appointmentStatus, formatTime } from "@/lib/format";
import { bookingSource, nowIndex } from "@/lib/today";
import { Badge, Card, cn } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * Today, in order, with a line where "now" is.
 *
 * Each row carries how the booking arrived, so the AI's share of the day is
 * visible without a chart, and opens a side panel rather than navigating —
 * a receptionist checking one patient should not lose their place in the day.
 */
export function TodayTimeline({
  rows,
  tz,
  now,
  onSelect,
}: {
  rows: TodayAppointment[];
  tz?: string;
  now: Date;
  onSelect: (a: TodayAppointment) => void;
}) {
  const split = nowIndex(rows, now);

  return (
    <Card className="overflow-hidden">
      <ol className="divide-y divide-line">
        {rows.map((a, i) => (
          <li key={a.id ?? i} className="relative">
            {i === split && <NowLine now={now} tz={tz} />}
            <Row a={a} tz={tz} past={i < split} onSelect={onSelect} />
          </li>
        ))}
        {split === rows.length && (
          <li className="relative">
            <NowLine now={now} tz={tz} />
            <p className="px-4 py-3 text-center text-xs text-ink-subtle">Nothing left today.</p>
          </li>
        )}
      </ol>
    </Card>
  );
}

function NowLine({ now, tz }: { now: Date; tz?: string }) {
  return (
    <div className="pointer-events-none flex items-center gap-2 px-4 py-1" aria-label="Current time">
      <span className="rounded-full bg-accent-rose px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
        Now · {formatTime(now.toISOString(), tz)}
      </span>
      <span className="h-px flex-1 bg-accent-rose/50" />
    </div>
  );
}

function Row({
  a,
  tz,
  past,
  onSelect,
}: {
  a: TodayAppointment;
  tz?: string;
  past: boolean;
  onSelect: (a: TodayAppointment) => void;
}) {
  const st = appointmentStatus(a.status!);
  const src = bookingSource(a.source);

  return (
    <button
      type="button"
      onClick={() => onSelect(a)}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-sunken/60",
        past && "opacity-60",
      )}
    >
      <span className="w-[64px] shrink-0">
        <span className="block font-display text-sm font-semibold tabular-nums text-ink">
          {a.starts_at ? formatTime(a.starts_at, tz) : "—"}
        </span>
        {a.token_number != null && (
          <span className="block text-[11px] tabular-nums text-ink-subtle">Token {a.token_number}</span>
        )}
      </span>
      <span
        aria-hidden
        className="h-9 w-1 shrink-0 rounded-full"
        style={{ background: a.colour_hex ?? "rgb(var(--brand-500))" }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{a.patient_name}</span>
        <span className="flex items-center gap-1.5 truncate text-xs text-ink-subtle">
          {a.doctor_name}
          <span aria-hidden>·</span>
          <Icon name={src.icon} className="h-3 w-3 shrink-0" />
          {src.label}
        </span>
      </span>
      <Badge tone={st.tone}>{st.label}</Badge>
    </button>
  );
}
