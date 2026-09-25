import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.js";

/**
 * Attaches a request id and a child logger. Every log line for a request — and
 * every downstream call — carries the same id, which is the difference between
 * debugging a dropped call in minutes and not at all.
 */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.log = logger.child({ reqId: req.id });
  res.setHeader("x-request-id", req.id);

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    req.log.info(
      { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) },
      "request",
    );
  });

  next();
}
