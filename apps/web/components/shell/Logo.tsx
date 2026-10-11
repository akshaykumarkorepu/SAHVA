import Image from "next/image";

export function Logo({ subtitle, compact }: { subtitle?: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-9 w-9 shrink-0">
        <Image
          src="/brand/sahva-logo.png"
          alt="SAHVA Logo"
          fill
          className="object-contain"
          priority
        />
      </div>
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
