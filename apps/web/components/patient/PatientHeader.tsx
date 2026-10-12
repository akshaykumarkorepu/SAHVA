import { Icon } from "@/components/icons";

export function PatientHeader({
  name,
  clinic,
  languageLabel,
  onToggleLang,
  onSignOut,
  signOutLabel,
}: {
  name: string;
  clinic: string;
  languageLabel: string;
  onToggleLang: () => void;
  onSignOut: () => void;
  signOutLabel: string;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-line glass">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-sm font-extrabold text-white"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold tracking-tight text-ink">
            {name}
          </p>
          <p className="truncate text-[11px] text-ink-subtle">{clinic}</p>
        </div>
        <button
          onClick={onToggleLang}
          className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
        >
          {languageLabel}
        </button>
        <button
          onClick={onSignOut}
          title={signOutLabel}
          aria-label={signOutLabel}
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-sunken hover:text-ink"
        >
          <Icon name="signOut" className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
