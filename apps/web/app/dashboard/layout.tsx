import { SessionProvider } from "@/lib/session";
import { AppShell } from "@/components/shell/AppShell";

/**
 * Staff session lives here rather than in the root layout: it resolves a
 * clinic membership, which a patient does not have. Scoping it means the
 * landing page, the portal and the patient app never make that lookup.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
