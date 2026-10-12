import Link from "next/link";
import { Icon } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-5">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-700">
          <Icon name="search" className="h-6 w-6" />
        </div>
        <h1 className="mt-5 font-display text-display-md text-ink">We couldn’t find that page</h1>
        <p className="mt-3 text-ink-muted">
          The link may be mistyped, or it may have expired — appointment links from WhatsApp only work for a
          limited time. Ask the clinic to send a new one.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-2xl bg-brand-600 px-4 text-sm font-medium text-on-brand hover:bg-brand-700"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
