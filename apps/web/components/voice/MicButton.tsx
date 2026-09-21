"use client";

import { Button } from "../ui";

export function MicButton({
  listening,
  thinking,
  speaking,
  supported,
  onStart,
  onStop,
}: {
  listening: boolean;
  thinking: boolean;
  speaking: boolean;
  supported: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const state = listening
    ? { label: "Listening… tap to stop", tone: "bg-rose-500 animate-pulse", icon: "🎙" }
    : thinking
    ? { label: "Thinking…", tone: "bg-amber-500", icon: "💭" }
    : speaking
    ? { label: "Speaking…", tone: "bg-sky-500", icon: "🔊" }
    : { label: "Tap to speak", tone: "bg-primary-600 hover:bg-primary-700", icon: "🎙" };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={listening ? onStop : onStart}
        disabled={!supported || thinking}
        aria-label="Microphone"
        className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white shadow-soft transition disabled:opacity-50 ${state.tone}`}
      >
        {state.icon}
      </button>
      <div className="text-sm font-medium text-ink-700">{state.label}</div>
      {!supported && (
        <div className="text-xs text-rose-600">
          Your browser doesn&apos;t support speech recognition. Use Chrome/Edge, or type below.
        </div>
      )}
      <Button variant="ghost" className="text-xs">
        Or type a message below ↓
      </Button>
    </div>
  );
}
