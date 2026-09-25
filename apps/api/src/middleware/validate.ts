import type { NextFunction, Request, Response } from "express";
import { z, type ZodTypeAny } from "zod";
import { AppError } from "../lib/errors.js";

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/**
 * Validates and *replaces* the request parts with their parsed values, so route
 * handlers receive coerced, typed data and never re-parse strings themselves.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ["params", "query", "body"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const detail = result.error.issues
          .map((i) => `${key}.${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        return next(new AppError(400, "VALIDATION_FAILED", "Invalid request.", detail));
      }
      // `req.query` has only a getter on Express 5; assign via defineProperty.
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
}

// --- Shared primitives -----------------------------------------------------

export const uuid = z.string().uuid();
/** E.164. The database enforces the same shape; this fails faster and clearer. */
export const phoneE164 = z.string().regex(/^\+[1-9]\d{7,14}$/, "must be E.164, e.g. +919885512345");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
export const isoDateTime = z.string().datetime({ offset: true });
export const languageCode = z.enum(["te", "en", "hi"]);

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
