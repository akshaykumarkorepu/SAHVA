import { AdminSessionProvider } from "@/lib/admin/session";

export const metadata = {
  title: "SAHVA Admin",
  robots: { index: false, follow: false },
};

/** The admin console: its own session, never linked from the clinic site. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminSessionProvider>{children}</AdminSessionProvider>;
}
