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
 * A signed-in user who may not belong to a clinic yet — the one moment that
 * is allowed is creating their clinic. Everything else goes through
 * requireAuth, which insists on an active membership.
 */
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw unauthorized("Missing bearer token");
    const token = header.slice("Bearer ".length).trim();
    const user = token ? await verifyAccessToken(token) : null;
    if (!user) throw unauthorized("Invalid or expired token");
    req.user = { id: user.id, email: user.email ?? null, db: dbForUser(token) };
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
/**
 * The accepted keys for a machine caller. Each caller can have its own
 * (VOICE_/TELEPHONY_/WORKER_API_KEY), so one leaked key does not open the
 * others; a comma-separated list lets a key be rotated without downtime —
 * add the new one, switch the caller, remove the old. A caller without its
 * own key falls back to VOICE_API_KEY.
 */
export function serviceKeys(caller: "voice" | "telephony" | "worker", e: Pick<typeof env, "VOICE_API_KEY" | "TELEPHONY_API_KEY" | "WORKER_API_KEY"> = env): Buffer[] {
  const raw = caller === "telephony" ? e.TELEPHONY_API_KEY : caller === "worker" ? e.WORKER_API_KEY : undefined;
  return (raw ?? e.VOICE_API_KEY)
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 32)
    .map((k) => Buffer.from(k));
}

export function keyMatches(presented: string, keys: Buffer[]): boolean {
  const p = Buffer.from(presented);
  // Compare against every key so timing does not reveal which one matched.
  let ok = false;
  for (const k of keys) if (p.length === k.length && timingSafeEqual(p, k)) ok = true;
  return ok;
}

export function requireServiceKey(caller: "voice" | "telephony" | "worker") {
  const keys = serviceKeys(caller);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!keyMatches(req.header("x-sahva-key") ?? "", keys)) {
      return next(unauthorized("Invalid service key"));
    }
    req.machine = { caller };
    next();
  };
}
