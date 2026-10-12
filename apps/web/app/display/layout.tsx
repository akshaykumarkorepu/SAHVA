import { SessionProvider } from "@/lib/session";

/**
 * The waiting-room screen. Outside the dashboard shell — no nav, no chrome —
 * but still a staff session: it is opened on the clinic's TV by staff, and the
 * API will not serve a clinic's queue to anyone else.
 */
export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

export const metadata = { title: "Waiting room · SAHVA", robots: { index: false, follow: false } };
