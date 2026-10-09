import { PatientSessionProvider } from "@/lib/portal/session";

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return <PatientSessionProvider>{children}</PatientSessionProvider>;
}
