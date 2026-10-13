import type { NextFunction, Request, Response } from "express";
import type { Enums } from "@sahva/types";
import { AppError, forbidden, unauthorized } from "../lib/errors.js";
import { dbAdmin, verifyAccessToken } from "../lib/supabase.js";

export type AdminRole = Enums<"platform_admin_role">;

/**
 * The assurance level in a Supabase access token: "aal2" once the user has
 * passed their second factor this session. Read only after verifyAccessToken
 * has had Supabase validate the token, so the payload can be trusted.
 */
export function tokenAal(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { aal?: unknown };
    return typeof claims.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
}

/**
 * Platform admins only — the people who run SAHVA, not clinic staff.
 *
 * Three checks, all required: a valid session, a second factor passed this
 * session (aal2), and an active row in platform_admins (read with the service
 * role; the table is invisible to every client). Anything less is refused
 * before a single admin route runs.
 */
export async function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw unauthorized("Please sign in.");
    const token = header.slice("Bearer ".length).trim();

    const user = token ? await verifyAccessToken(token) : null;
    if (!user) throw unauthorized("Your session has expired. Please sign in again.");

    if (tokenAal(token) !== "aal2") {
      throw new AppError(401, "MFA_REQUIRED", "Enter the code from your authenticator app to continue.");
    }

    const { data, error } = await dbAdmin
      .from("platform_admins")
      .select("role, full_name, disabled_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      req.log.error({ err: error }, "platform admin lookup failed");
      throw unauthorized("Could not check admin access.");
    }
    if (!data || data.disabled_at) {
      req.log.warn({ userId: user.id }, "non-admin attempted the admin API");
      throw forbidden("This account is not a SAHVA admin.");
    }

    req.admin = { userId: user.id, email: user.email ?? null, role: data.role, fullName: data.full_name };
    req.log = req.log.child({ adminId: user.id });
    next();
  } catch (err) {
    next(err);
  }
}

/** Narrow to some admin roles. A super admin can always proceed. */
export function requireAdminRole(...roles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(unauthorized());
    if (req.admin.role !== "super_admin" && !roles.includes(req.admin.role)) {
      return next(forbidden(`Requires admin role: ${roles.join(" or ")}`));
    }
    next();
  };
}

/**
 * Before the second factor: is this signed-in account a SAHVA admin at all?
 * The sign-in page asks this before setting up an authenticator, so a clinic
 * or patient session left in the browser is never walked into admin MFA
 * set-up. Needs only a valid session; answers only about the caller.
 */
export async function adminEligibility(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    const user = token ? await verifyAccessToken(token) : null;
    if (!user) throw unauthorized("Please sign in.");
    const { data, error } = await dbAdmin
      .from("platform_admins")
      .select("disabled_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new AppError(503, "ADMIN_CHECK_FAILED", "Could not check admin access.");
    res.json({ admin: !!data && !data.disabled_at, email: user.email ?? null });
  } catch (err) {
    next(err);
  }
}
