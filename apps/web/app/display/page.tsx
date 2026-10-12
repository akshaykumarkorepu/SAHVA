"use client";

import * as React from "react";
import { useRequireSession } from "@/lib/session";
import { useApi } from "@/lib/hooks";
import { useLiveClinic } from "@/lib/live";
import type { TodayAppointment } from "@/lib/types";
import { changedNext, queues, type DoctorQueue } from "@/lib/display";
import { Spinner, cn } from "@/components/ui";

/**
 * Waiting-room TV.
 *
 * Shows, per doctor, the next token among patients who have arrived, and the
 * tokens after it. Tokens only — this screen faces the public. Updates live,
 * with a 20-second poll as a floor because it runs unattended all day and a
 * dropped socket must not freeze it. When a doctor's next token changes it
 * chimes and that column flashes, so people do not have to watch the screen.
 */
export default function DisplayPage() {
  const { status, clinic } = useRequireSession();
  const today = useApi<TodayAppointment[]>(status === "ready" ? "/appointments/today" : null, [status], {
    refetchInterval: 20_000,
  });
  useLiveClinic(clinic?.id);
  const [started, setStarted] = React.useState(false);
  const [flash, setFlash] = React.useState<string[]>([]);
  const prev = React.useRef<DoctorQueue[] | null>(null);
  const audio = React.useRef<AudioContext | null>(null);
  const now = useClock();

  const qs = React.useMemo(() => queues(today.data ?? []), [today.data]);

  React.useEffect(() => {
    if (prev.current) {
      const moved = changedNext(prev.current, qs);
      if (moved.length > 0) {
        setFlash(moved);
        if (audio.current) chime(audio.current);
        const id = setTimeout(() => setFlash([]), 4000);
        prev.current = qs;
        return () => clearTimeout(id);
      }
    }
    prev.current = qs;
  }, [qs]);

  if (status !== "ready") {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface-inverse">
        <Spinner />
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-surface-inverse text-white">
      <header className="flex items-center justify-between px-10 py-6">
        <p className="font-display text-3xl font-semibold tracking-tight">{clinic?.name}</p>
        <p className="font-display text-3xl tabular-nums opacity-80">
          {now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: clinic?.timezone })}
        </p>
      </header>

      <section className={cn("grid flex-1 gap-6 px-10 pb-10", qs.length > 2 ? "grid-cols-3" : qs.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {qs.length === 0 ? (
          <p className="col-span-full self-center text-center text-3xl opacity-70">No appointments today · ఈ రోజు అపాయింట్‌మెంట్లు లేవు</p>
        ) : (
          qs.map((q) => (
            <article
              key={q.doctorId}
              className={cn(
                "flex flex-col rounded-3xl bg-white/[0.06] p-8 ring-1 ring-white/10 transition duration-500",
                flash.includes(q.doctorId) && "bg-white/[0.16] ring-4 ring-white/60",
              )}
            >
              <p className="flex items-center gap-3 font-display text-3xl font-semibold">
                <span aria-hidden className="h-4 w-4 rounded-full" style={{ background: q.colour ?? "white" }} />
                {q.doctorName}
              </p>
              <p className="mt-8 text-xl uppercase tracking-[0.2em] opacity-70">Next · తదుపరి</p>
              <p className="font-display text-[clamp(6rem,14vw,12rem)] font-bold leading-none tabular-nums">
                {q.next ?? "—"}
              </p>
              <div className="mt-auto pt-8">
                <p className="text-lg opacity-70">Then · తర్వాత</p>
                <p className="mt-2 font-display text-4xl tabular-nums tracking-wide">
                  {q.waiting.length > 0 ? q.waiting.slice(0, 6).join("  ·  ") : "—"}
                </p>
                <p className="mt-4 text-lg opacity-60">{q.seen} seen today</p>
              </div>
            </article>
          ))
        )}
      </section>

      {!started && (
        // Browsers allow sound only after a gesture; the same tap goes fullscreen.
        <button
          type="button"
          onClick={() => {
            const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audio.current = new AC();
            void document.documentElement.requestFullscreen?.().catch(() => undefined);
            setStarted(true);
          }}
          className="fixed inset-0 grid place-items-center bg-surface-inverse/90 text-3xl font-semibold"
        >
          Tap to start the waiting-room screen
        </button>
      )}
    </main>
  );
}

/** Two soft tones — audible across a waiting room without being an alarm. */
function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  for (const [i, freq] of [880, 660].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + i * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.35 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.35 + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + i * 0.35);
    osc.stop(t + i * 0.35 + 0.65);
  }
}

function useClock(): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
