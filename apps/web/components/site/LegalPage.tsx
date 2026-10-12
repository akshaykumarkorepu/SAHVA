import Link from "next/link";

/** Shared frame for the policy pages: readable measure, last-updated date. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-surface">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="font-display text-base font-bold text-ink">
            SAHVA
          </Link>
          <Link href="/#pricing" className="text-sm font-medium text-ink-muted hover:text-ink">
            Pricing
          </Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-12 text-[15px] leading-relaxed text-ink-muted [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="font-display text-display-md text-ink">{title}</h1>
        <p className="!mt-2 text-sm text-ink-subtle">Last updated {updated}</p>
        {children}
      </article>
      <footer className="border-t border-line py-8 text-center text-xs text-ink-subtle">
        <Link href="/terms" className="mx-2 hover:text-ink">Terms</Link>·
        <Link href="/privacy" className="mx-2 hover:text-ink">Privacy</Link>·
        <Link href="/refund-policy" className="mx-2 hover:text-ink">Refunds</Link>·
        <Link href="/contact" className="mx-2 hover:text-ink">Contact</Link>
      </footer>
    </main>
  );
}
