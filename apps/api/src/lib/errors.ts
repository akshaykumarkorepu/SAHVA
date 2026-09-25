import type { PostgrestError } from "@supabase/supabase-js";

/**
 * A typed application error. Every failure the client can act on gets a stable
 * `code` — the frontend switches on that, never on the message text.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, msg: string, detail?: string) =>
  new AppError(400, code, msg, detail);
export const unauthorized = (msg = "Authentication required") =>
  new AppError(401, "UNAUTHENTICATED", msg);
export const forbidden = (msg = "Not permitted") =>
  new AppError(403, "FORBIDDEN", msg);
export const notFound = (what: string) =>
  new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (code: string, msg: string, hint?: string) =>
  new AppError(409, code, msg, undefined, hint);

/**
 * Translate a Postgres/PostgREST failure into an AppError.
 *
 * The database is the authority in this system, so its constraint violations
 * are meaningful product events, not opaque 500s. In particular
 * `23P01 exclusion_violation` is the no-double-booking constraint firing, and
 * the caller genuinely needs to hear "that slot just went".
 */
export function fromPostgrest(e: PostgrestError, context: string): AppError {
  switch (e.code) {
    case "23P01": // exclusion_violation — appointments_no_double_booking
      return conflict(
        "SLOT_TAKEN",
        "That time is no longer available.",
        "Fetch fresh availability and offer the next free slot.",
      );
    case "23505": // unique_violation
      return conflict("ALREADY_EXISTS", "That record already exists.");
    case "23503": // foreign_key_violation — includes cross-tenant composite FKs
      return new AppError(
        409,
        "INVALID_REFERENCE",
        "A referenced record is missing or belongs to another clinic.",
        e.details,
      );
    case "23514": // check_violation
      return badRequest("CONSTRAINT_VIOLATED", "That change is not allowed.", e.details);
    case "23502": // not_null_violation
      return badRequest("MISSING_FIELD", "A required field was missing.", e.details);
    case "42501": // insufficient_privilege — RLS or an explicit raise
      return forbidden(e.message || "Not permitted for this clinic.");
    case "P0002": // no_data_found
      return notFound(context);
    case "PGRST116": // PostgREST: .single() matched no rows
      return notFound(context);
    case "22P02": // invalid_text_representation
      return badRequest("INVALID_INPUT", "A value was not in the expected format.", e.details);
    default:
      return new AppError(
        500,
        "DATABASE_ERROR",
        `Database error while ${context}.`,
        e.details ?? e.message,
        e.hint ?? undefined,
      );
  }
}

/**
 * Unwrap a PostgREST result, converting an error into a typed AppError.
 *
 * The generic is over the whole response object, not over `data`. supabase-js's
 * query builder is a custom Thenable, so `unwrap(await builder, ...)` lets the
 * parameter type contextually drive the builder's own `then` inference — and
 * inferring `T` from the nested `data` position collapses every column to
 * `never`. Inferring `R` from the argument as a whole sidesteps that.
 */
export function unwrap<R extends { data: unknown; error: PostgrestError | null }>(
  res: R,
  context: string,
): NonNullable<R["data"]> {
  if (res.error) throw fromPostgrest(res.error, context);
  if (res.data === null || res.data === undefined) throw notFound(context);
  return res.data as NonNullable<R["data"]>;
}
