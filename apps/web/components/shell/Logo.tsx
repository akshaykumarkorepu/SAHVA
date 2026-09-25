export function Logo({ clinicName }: { clinicName?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-lg font-bold text-white"
      >
        S
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-ink-900">SAHVA</p>
        <p className="truncate text-xs text-ink-500">{clinicName ?? "AI receptionist"}</p>
      </div>
    </div>
  );
}
