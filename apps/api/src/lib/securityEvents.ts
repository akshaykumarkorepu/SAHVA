import type { NextFunction, Request, Response } from "express";
import { dbAdmin } from "./supabase.js";

export type SecurityKind = "auth_failed" | "access_denied" | "rate_limited" | "portal_link_invalid" | "admin_denied";

/**
 * Which refused requests are worth recording, and as what. Pure, so the
 * mapping is tested on its own. Paths are the API's own; anything outside
 * /api (health checks, 404 noise) is ignored.
 */
export function classify(method: string, path: string, status: number): SecurityKind | null {
  if (method === "OPTIONS" || !path.startsWith("/api/") || path.startsWith("/api/health")) return null;
  if (status === 429) return "rate_limited";
  if (status !== 401 && status !== 403) return null;
  if (path.startsWith("/api/portal/")) return "portal_link_invalid";
  if (path.startsWith("/api/admin")) return "admin_denied";
  return status === 401 ? "auth_failed" : "access_denied";
}

/**
 * At most one row per address and kind every few seconds: a scanner hitting
 * the API a thousand times should not write a thousand rows. Bounded memory.
 */
export class Throttle {
  private last = new Map<string, number>();
  constructor(private windowMs = 5_000, private max = 10_000) {}
  allow(key: string, now = Date.now()): boolean {
    const t = this.last.get(key);
    if (t !== undefined && now - t < this.windowMs) return false;
    if (this.last.size >= this.max) this.last.clear();
    this.last.set(key, now);
    return true;
  }
}

const throttle = new Throttle();

/** Record refused requests after the response is sent. Never slows or fails a request. */
export function securityEvents(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const path = req.originalUrl.split("?")[0];
    const kind = classify(req.method, path, res.statusCode);
    if (!kind) return;
    const ip = req.ip ?? null;
    if (!throttle.allow(`${ip}|${kind}`)) return;
    // Portal paths carry the token itself: never store it.
    const safePath = kind === "portal_link_invalid" ? "/api/portal/:token" : path.slice(0, 200);
    void dbAdmin
      .from("security_events")
      .insert({
        kind,
        ip,
        method: req.method,
        path: safePath,
        actor_user_id: req.auth?.userId ?? req.admin?.userId ?? null,
        clinic_id: req.auth?.clinicId ?? null,
        details: { status: res.statusCode, request_id: req.id },
      })
      .then(({ error }) => {
        if (error) req.log.warn({ err: error }, "security event not recorded");
      });
  });
  next();
}
