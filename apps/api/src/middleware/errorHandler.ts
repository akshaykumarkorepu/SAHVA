import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { isProd } from "../config/env.js";

/** 404 for unmatched routes, so the client gets JSON rather than Express HTML. */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
    requestId: req.id,
  });
}

/**
 * Single exit point for every failure. Clients always get the same envelope:
 *   { error: { code, message, detail?, hint? }, requestId }
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  let app: AppError;

  if (err instanceof AppError) {
    app = err;
  } else if (err instanceof ZodError) {
    app = new AppError(400, "VALIDATION_FAILED", "Invalid request.", err.message);
  } else if (err instanceof SyntaxError && "body" in err) {
    app = new AppError(400, "MALFORMED_JSON", "Request body is not valid JSON.");
  } else {
    app = new AppError(
      500,
      "INTERNAL_ERROR",
      "Something went wrong.",
      err instanceof Error ? err.message : String(err),
    );
  }

  const log = req.log ?? console;
  if (app.status >= 500) {
    log.error({ err, code: app.code }, app.message);
  } else {
    log.warn({ code: app.code, detail: app.detail }, app.message);
  }

  res.status(app.status).json({
    error: {
      code: app.code,
      message: app.message,
      // Internal details stay internal in production; the request id is the
      // thread back to the full log line.
      ...(app.status < 500 || !isProd ? { detail: app.detail } : {}),
      ...(app.hint ? { hint: app.hint } : {}),
    },
    requestId: req.id,
  });
}

/** Wraps an async handler so a rejected promise reaches errorHandler. */
export function asyncRoute<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
