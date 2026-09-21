import { api } from "@/lib/api";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Direct DB read on the server would be ideal, but we go through the API
  // to keep the boundary honest. In dev this hits the rewrite → Express.
  let clinicName = "Sri Sai Clinic";
  try {
    const c = await api.clinic();
    clinicName = c.name;
  } catch {
    /* fallback */
  }
  return (
    <div className="flex min-h-screen bg-ink-100/40">
      <Sidebar clinicName={clinicName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar clinicName={clinicName} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
