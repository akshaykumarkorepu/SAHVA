import { redirect } from "next/navigation";

/**
 * Kept as a redirect. Patients reach this from WhatsApp portal links that were
 * sent before /signin existed, and those messages cannot be recalled.
 */
export default function LegacyPatientLogin({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ? `&next=${encodeURIComponent(searchParams.next)}` : "";
  redirect(`/signin?role=patient${next}`);
}
