"use client";

import type { AppointmentWithJoins, Doctor } from "@/lib/types";
import { appointmentStatus, formatTime } from "@/lib/format";
import { hourMarks, layoutDay, minutesInDay, type DayOff } from "@/lib/dayview";
import { Card, cn } from "@/components/ui";

/** Vertical scale. 1.2px a minute puts a 15-minute slot at a tappable 18px. */
const PX = 1.2;

/**
 * One column per doctor, appointments placed by time, leave shaded.
 *
 * Status is written on each block, never carried by colour alone; the colour
 * strip is the doctor's, so a glance down a column reads as "whose" and the
 * text says "what state".
 */
export function DoctorDayView({
  appointments,
  doctors,
  timeOff,
  day,
  tz = "Asia/Kolkata",
  now,
  onSelect,
}: {
  appointments: AppointmentWithJoins[];
  doctors: Doctor[];
  timeOff: DayOff[];
  day: string;
  tz?: string;
  now: Date;
  onSelect: (a: AppointmentWithJoins) => void;
}) {
  const layout = layoutDay({ appointments, doctors, timeOff, day, tz });
  const span = layout.endMin - layout.startMin;
  const height = span * PX;
  const marks = hourMarks(layout.startMin, layout.endMin);
  const nowMin = minutesInDay(now.toISOString(), day, tz) - layout.startMin;
  const showNow = nowMin > 0 && nowMin < span;

  return (
    <Card className="overflow-hidden">
      <div className="scrollbar-slim overflow-x-auto">
        <div className="flex min-w-max">
          {/* Hour gutter, pinned while the doctor columns scroll sideways. */}
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-line bg-surface-raised">
            <div className="h-12 border-b border-line" />
            <div className="relative" style={{ height }}>
              {marks.map((m) => (
                <span
                  key={m.min}
                  className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-ink-subtle"
                  style={{ top: m.min * PX }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {layout.columns.map(({ doctor, blocks, off }) => (
            <div key={doctor.id} className="w-44 shrink-0 border-r border-line last:border-r-0 sm:w-52">
              <div className="flex h-12 items-center gap-2 border-b border-line px-3">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: doctor.colour_hex ?? undefined }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">{doctor.spoken_name}</span>
                  <span className="block truncate text-[11px] text-ink-subtle">
                    {blocks.length} appointment{blocks.length === 1 ? "" : "s"}
                  </span>
                </span>
              </div>

              <div className="relative" style={{ height }}>
                {marks.map((m) => (
                  <div
                    key={m.min}
                    aria-hidden
                    className="absolute inset-x-0 border-t border-line/60"
                    style={{ top: m.min * PX }}
                  />
                ))}

                {off.map((o, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 flex items-start justify-center bg-[repeating-linear-gradient(135deg,rgb(var(--line)/0.6)_0_6px,transparent_6px_12px)] pt-1"
                    style={{ top: o.top * PX, height: o.height * PX }}
                  >
                    <span className="rounded bg-surface-raised px-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                      Unavailable
                    </span>
                  </div>
                ))}

                {blocks.map(({ top, height: h, item }) => {
                  const st = appointmentStatus(item.status);
                  const faded = item.status === "completed" || item.status === "no_show";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item)}
                      aria-label={`${formatTime(item.starts_at, tz)} ${item.patients?.full_name ?? ""}, ${st.label}`}
                      className={cn(
                        // py-px + 14px lines: a 15-minute block is 16px tall, so
                        // anything roomier clips the patient's name.
                        "absolute inset-x-1 overflow-hidden rounded-md border bg-surface-raised px-2 py-px text-left leading-[14px] shadow-xs transition hover:z-10 hover:shadow-lift",
                        item.status === "needs_reschedule"
                          ? "border-accent-rose/50 bg-accent-rose/[0.06]"
                          : "border-line",
                        faded && "opacity-60",
                      )}
                      style={{
                        top: top * PX + 1,
                        height: h * PX - 2,
                        borderLeft: `3px solid ${doctor.colour_hex ?? "rgb(var(--brand-500))"}`,
                      }}
                    >
                      <span className="block truncate text-[11px] font-semibold text-ink">
                        {formatTime(item.starts_at, tz)} · {item.patients?.full_name ?? "—"}
                      </span>
                      {h * PX >= 30 && <span className="block truncate text-[10px] leading-[14px] text-ink-muted">{st.label}</span>}
                    </button>
                  );
                })}

                {showNow && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-accent-rose"
                    style={{ top: nowMin * PX }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
