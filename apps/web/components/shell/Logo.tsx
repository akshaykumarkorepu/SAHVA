export function Logo({ subtitle, compact }: { subtitle?: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br from-brand-400 to-brand-700 font-display text-base font-extrabold text-white shadow-glow"
      >
        S
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate font-display text-[15px] font-bold tracking-tight text-ink">
            SAHVA
          </span>
          <span className="block truncate text-[11px] text-ink-subtle">
            {subtitle ?? "AI receptionist"}
          </span>
        </span>
      )}
    </div>
  );
}
