"use client";

import { useEffect, useRef } from "react";
import type { VoiceTurn } from "./useVoiceSession";

export function Transcript({ turns }: { turns: VoiceTurn[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [turns.length]);

  return (
    <div ref={ref} className="h-[420px] overflow-y-auto rounded-xl bg-ink-100/40 p-4">
      <div className="space-y-3">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                t.role === "user"
                  ? "bg-primary-600 text-white"
                  : t.role === "system"
                  ? "bg-ink-100 text-ink-500 italic"
                  : "bg-white text-ink-900"
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
