/**
 * Which host may serve the admin console.
 *
 * In production the console lives on its own subdomain (ADMIN_HOST, e.g.
 * admin.sahva.in): /admin on the clinic domain is a plain 404 — not a login
 * page, not a redirect, nothing that says it exists — and the admin host
 * serves only the console. Without ADMIN_HOST (local development) /admin is
 * served wherever the app runs.
 *
 * Hiding the console is not its security — the API checks admin status and a
 * second factor on every call. It keeps the door out of sight.
 */
export type HostDecision = { kind: "next" } | { kind: "not_found" } | { kind: "redirect"; to: string };

const SHARED = /^\/(_next|api|fonts|brand|favicon|robots\.txt)/;

/**
 * Which site this deployment is. The clinic site and the admin console are
 * deployed separately (two Vercel projects, same code): SITE_MODE says which,
 * so it holds on preview URLs too, where the host name is random.
 *   "admin"  — serves only the console; everything else goes to /admin.
 *   "clinic" — /admin does not exist.
 *   unset    — decided by ADMIN_HOST as before (or everything, locally).
 */
export type SiteMode = "admin" | "clinic" | undefined;

export function siteMode(v: string | undefined): SiteMode {
  return v === "admin" || v === "clinic" ? v : undefined;
}

export function decideAdminRoute(host: string | null, path: string, adminHost: string | undefined, mode?: SiteMode): HostDecision {
  const isAdminPath = path === "/admin" || path.startsWith("/admin/");
  if (mode === "clinic") return isAdminPath ? { kind: "not_found" } : { kind: "next" };
  if (mode === "admin") return isAdminPath || SHARED.test(path) ? { kind: "next" } : { kind: "redirect", to: "/admin" };
  if (!adminHost) return { kind: "next" };
  const onAdminHost = (host ?? "").split(":")[0].toLowerCase() === adminHost.toLowerCase();

  if (onAdminHost) {
    if (isAdminPath || SHARED.test(path)) return { kind: "next" };
    return { kind: "redirect", to: "/admin" };
  }
  return isAdminPath ? { kind: "not_found" } : { kind: "next" };
}
