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

export function decideAdminRoute(host: string | null, path: string, adminHost: string | undefined): HostDecision {
  if (!adminHost) return { kind: "next" };
  const onAdminHost = (host ?? "").split(":")[0].toLowerCase() === adminHost.toLowerCase();
  const isAdminPath = path === "/admin" || path.startsWith("/admin/");

  if (onAdminHost) {
    if (isAdminPath || SHARED.test(path)) return { kind: "next" };
    return { kind: "redirect", to: "/admin" };
  }
  return isAdminPath ? { kind: "not_found" } : { kind: "next" };
}
