
/** One heart outline, drawn once and reused for the track and both runners. */
const HEART =
  "M50 86 C 22 66, 6 50, 6 31 C 6 17, 16 7, 29 7 C 39 7, 46 13, 50 21 C 54 13, 61 7, 71 7 C 84 7, 94 17, 94 31 C 94 50, 78 66, 50 86 Z";

const SIZE = { sm: "h-8 w-8", md: "h-14 w-14", lg: "h-20 w-20" } as const;

/**
 * SAHVA's loader: a heart outline with a red and a green stroke chasing each
 * other round it, and a small beat in the middle. pathLength=100 lets both
 * runners share one dash pattern, half a lap apart.
 *
 * With reduced motion the runners stop where they are and the heart simply
 * shows both colours — still clearly "loading", without movement.
 */
export function HeartLoader({ size = "md", label = "Loading", className }: { size?: keyof typeof SIZE; label?: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={["relative inline-block", SIZE[size], className].filter(Boolean).join(" ")}>
      <svg viewBox="0 0 100 92" className="h-full w-full overflow-visible" aria-hidden>
        <path d={HEART} pathLength={100} fill="none" strokeWidth={6} strokeLinejoin="round" className="stroke-line" />
        <path
          d={HEART}
          pathLength={100}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="26 74"
          className="heart-runner stroke-accent-rose"
        />
        <path
          d={HEART}
          pathLength={100}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="26 74"
          strokeDashoffset={-50}
          className="heart-runner heart-runner-2 stroke-brand-500"
        />
        <path d={HEART} fill="rgb(var(--accent-rose) / 0.10)" className="heart-beat" />
      </svg>
    </span>
  );
}

/** A whole screen waiting on something: the heart, and an optional line under it. */
export function PageLoader({ message }: { message?: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-surface px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <HeartLoader size="lg" label={message ?? "Loading"} />
        {message && <p className="text-sm text-ink-muted">{message}</p>}
      </div>
    </div>
  );
}
