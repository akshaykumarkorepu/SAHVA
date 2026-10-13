import { get } from "./api";

export type AccountKind = "admin" | "staff" | "patient" | "staff_no_clinic" | "none";

/** What the signed-in account is, from the API (never from which tab was clicked). */
export async function whoami(): Promise<{ kind: AccountKind; email: string | null }> {
  return get("/whoami");
}

/** A same-origin path, or nothing: `next` comes from the URL and must not redirect off-site. */
function safe(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/**
 * Where a login belongs. A requested `next` is honoured only when it is in
 * that account's own area, so a staff login with `?next=/me` still lands on
 * the dashboard, and a patient with `?next=/dashboard` lands on /me.
 * Admins have no home on the clinic site: null.
 */
export function homeFor(kind: AccountKind, next?: string | null): string | null {
  const n = safe(next);
  switch (kind) {
    case "staff":
    case "staff_no_clinic":
      return n && n.startsWith("/dashboard") ? n : "/dashboard";
    case "patient":
      return n && (n === "/me" || n.startsWith("/me/") || n.startsWith("/me?")) ? n : "/me";
    case "admin":
      return null;
    default:
      // Signed in but linked to nothing yet: /me explains what to do.
      return "/me";
  }
}
