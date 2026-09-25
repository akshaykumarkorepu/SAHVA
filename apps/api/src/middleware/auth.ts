import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { dbForUser, verifyAccessToken } from "../lib/supabase.js";
import type { Enums } from "@sahva/types";

/**
 * Authenticates a staff user and resolves their clinic.
 *
 * The clinic is read from `clinic_members`, never from the request. A client
 * cannot select which tenant it operates on by sending a different body — that
 * is the whole point.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw unauthorized("Missing bearer token");

    const token = header.slice("Bearer ".length).trim();
    if (!token) throw unauthorized("Empty bearer token");

    const user = await verifyAccessToken(token);
    if (!user) throw unauthorized("Invalid or expired token");

    const db = dbForUser(token);

    // Read through the user's own RLS-scoped client: a suspended or removed
    // member simply sees no row here and is rejected.
    const { data, error } = await db
      .from("clinic_members")
      .select("clinic_id, role")
      .eq("staff_id", user.id)
      .eq("status", "active")
      .order("clinic_id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      req.log.error({ err: error }, "membership lookup failed");
      throw unauthorized("Could not resolve clinic membership");
    }
    if (!data) throw forbidden("This account is not an active member of any clinic");

    req.auth = {
      userId: user.id,
      email: user.email ?? null,
      clinicId: data.clinic_id,
      role: data.role,
      db,
    };
    req.log = req.log.child({ userId: user.id, clinicId: data.clinic_id });
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role gate. RLS already enforces this at the row level; checking here too
 * turns a silent empty result into an explicit 403 the UI can render.
 */
export function requireRole(...roles: Enums<"staff_role">[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(forbidden(`Requires role: ${roles.join(" or ")}`));
    }
    next();
  };
}

/**
 * Authenticates a machine caller (telephony webhook, voice orchestrator).
 *
 * An inbound phone call carries no user session, so these routes use a shared
 * secret compared in constant time. Real carrier webhooks should additionally
 * verify the provider's request signature once telephony lands.
 */
export function requireServiceKey(caller: "voice" | "telephony" | "worker") {
  const expected = Buffer.from(env.VOICE_API_KEY);
  return (req: Request, _res: Response, next: NextFunction) => {
    const presented = Buffer.from(req.header("x-sahva-key") ?? "");
    if (
      presented.length !== expected.length ||
      !timingSafeEqual(presented, expected)
    ) {
      return next(unauthorized("Invalid service key"));
    }
    req.machine = { caller };
    next();
  };
}
