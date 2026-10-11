import { redirect } from "next/navigation";

/**
 * Kept as a redirect, not deleted.
 *
 * This path is in bookmarks, in docs/setup.md, and in anything a clinic was
 * sent during onboarding. Sign-in now lives at /signin with a role toggle.
 */
export default function LegacyStaffLogin({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ? `&next=${encodeURIComponent(searchParams.next)}` : "";
  redirect(`/signin?role=staff${next}`);
}
