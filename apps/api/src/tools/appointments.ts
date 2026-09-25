import type { Db } from "../lib/supabase.js";
import { dbAdmin } from "../lib/supabase.js";
import { AppError, fromPostgrest, unwrap } from "../lib/errors.js";
import { TOOL_ARG_SCHEMAS, type ToolName } from "./schemas.js";
import { logger } from "../lib/logger.js";
import type { Json } from "@sahva/types";

export type ToolContext = {
  clinicId: string;
  /** Null for a browser demo turn that is not attached to a real call. */
  callId: string | null;
  turnId?: string | null;
  db?: Db;
};

export type ToolOutcome = {
  allowed: boolean;
  /** Rendered back to the model. Kept short and literal — no invented detail. */
  result: Record<string, unknown>;
  denialReason?: string;
};

const db = () => dbAdmin;

// --- Helpers ---------------------------------------------------------------

/**
 * Resolve a doctor from whatever the caller said. Matches an id, then an exact
 * spoken name, then a loose contains match — and refuses ambiguity rather than
 * guessing, because booking with the wrong doctor is a real-world failure.
 */
async function resolveDoctor(clinicId: string, needle: string) {
  const term = needle.trim().replace(/^(dr|doctor)\.?\s+/i, "");

  const { data, error } = await db()
    .from("doctors")
    .select("id, full_name, spoken_name, specialty, consult_duration_min, consult_fee_paise")
    .eq("clinic_id", clinicId)
    .eq("is_active", true);

  if (error) throw fromPostgrest(error, "looking up doctors");
  const doctors = data ?? [];

  if (/^[0-9a-f-]{36}$/i.test(needle)) {
    const byId = doctors.find((d) => d.id === needle);
    if (byId) return { doctor: byId, candidates: [] as typeof doctors };
  }

  const lower = term.toLowerCase();
  const exact = doctors.filter(
    (d) =>
      d.spoken_name.toLowerCase().replace(/^dr\.?\s+/i, "") === lower ||
      d.full_name.toLowerCase().replace(/^dr\.?\s+/i, "") === lower,
  );
  if (exact.length === 1) return { doctor: exact[0], candidates: [] };

  const loose = doctors.filter(
    (d) =>
      d.spoken_name.toLowerCase().includes(lower) ||
      d.full_name.toLowerCase().includes(lower) ||
      (d.specialty ?? "").toLowerCase().includes(lower),
  );
  if (loose.length === 1) return { doctor: loose[0], candidates: [] };

  return { doctor: null, candidates: loose.length > 0 ? loose : doctors };
}

/** The patient's next live appointment, used by reschedule and cancel. */
async function findUpcomingAppointment(
  clinicId: string,
  phone: string,
  patientName?: string,
) {
  let q = db()
    .from("patients")
    .select("id, full_name")
    .eq("clinic_id", clinicId)
    .eq("phone_e164", phone);

  const patients = unwrap(await q, "patient");
  if (patients.length === 0) return { appointment: null, ambiguous: [] as string[] };

  // One handset can serve a family, so a name may be required to disambiguate.
  let candidates = patients;
  if (patientName) {
    const lower = patientName.trim().toLowerCase();
    const narrowed = patients.filter((p) => p.full_name.trim().toLowerCase() === lower);
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (candidates.length > 1) {
    return { appointment: null, ambiguous: candidates.map((p) => p.full_name) };
  }

  const { data, error } = await db()
    .from("appointments")
    .select("id, starts_at, doctor_id, patient_id, status")
    .eq("clinic_id", clinicId)
    .eq("patient_id", candidates[0].id)
    .in("status", ["booked", "confirmed"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw fromPostgrest(error, "finding the appointment");
  return { appointment: data, ambiguous: [] as string[] };
}

// --- Tool implementations --------------------------------------------------

async function checkAvailability(ctx: ToolContext, args: unknown): Promise<ToolOutcome> {
  const { doctor: needle, date } = TOOL_ARG_SCHEMAS.check_availability.parse(args);
  const { doctor, candidates } = await resolveDoctor(ctx.clinicId, needle);

  if (!doctor) {
    return {
      allowed: false,
      denialReason: `Could not resolve doctor "${needle}"`,
      result: {
        ok: false,
        reason: "doctor_not_found",
        available_doctors: candidates.map((d) => `${d.spoken_name} (${d.specialty})`),
      },
    };
  }

  const slots = unwrap(
    await db().rpc("get_available_slots", { p_doctor_id: doctor.id, p_date: date }),
    "availability",
  );

  return {
    allowed: true,
    result: {
      ok: true,
      doctor: doctor.spoken_name,
      doctor_id: doctor.id,
      date,
      // Cap what the model sees: reading 30 slots aloud helps nobody.
      slots: slots.slice(0, 12).map((s) => s.slot_start),
      total_available: slots.length,
    },
  };
}

async function bookAppointment(ctx: ToolContext, args: unknown): Promise<ToolOutcome> {
  const a = TOOL_ARG_SCHEMAS.book_appointment.parse(args);
  const { doctor, candidates } = await resolveDoctor(ctx.clinicId, a.doctor);

  if (!doctor) {
    return {
      allowed: false,
      denialReason: `Could not resolve doctor "${a.doctor}"`,
      result: {
        ok: false,
        reason: "doctor_not_found",
        available_doctors: candidates.map((d) => d.spoken_name),
      },
    };
  }

  const { data, error } = await db().rpc("book_appointment", {
    p_clinic_id: ctx.clinicId,
    p_doctor_id: doctor.id,
    p_patient_name: a.patient_name,
    p_phone_e164: a.phone,
    p_starts_at: a.starts_at,
    p_reason: a.reason ?? undefined,
    p_call_id: ctx.callId ?? undefined,
    p_source: "ai_call",
    p_language: a.language ?? undefined,
  });

  if (error) {
    // The database refused. This is the guard rail working, and it is recorded
    // so the refusal is auditable rather than invisible.
    const appErr = fromPostgrest(error, "booking the appointment");
    return {
      allowed: false,
      denialReason: `${appErr.code}: ${appErr.message}`,
      result: { ok: false, reason: appErr.code, message: appErr.message, hint: appErr.hint },
    };
  }

  return {
    allowed: true,
    result: {
      ok: true,
      appointment_id: data.id,
      doctor: doctor.spoken_name,
      starts_at: data.starts_at,
      duration_min: data.duration_min,
    },
  };
}

async function rescheduleAppointment(ctx: ToolContext, args: unknown): Promise<ToolOutcome> {
  const a = TOOL_ARG_SCHEMAS.reschedule_appointment.parse(args);
  const { appointment, ambiguous } = await findUpcomingAppointment(
    ctx.clinicId,
    a.phone,
    a.patient_name,
  );

  if (ambiguous.length > 0) {
    return {
      allowed: false,
      denialReason: "Multiple patients share this phone number",
      result: { ok: false, reason: "ambiguous_patient", candidates: ambiguous },
    };
  }
  if (!appointment) {
    return {
      allowed: false,
      denialReason: "No upcoming appointment for this number",
      result: { ok: false, reason: "no_upcoming_appointment" },
    };
  }

  let newDoctorId: string | undefined;
  if (a.doctor) {
    const { doctor } = await resolveDoctor(ctx.clinicId, a.doctor);
    if (!doctor) {
      return {
        allowed: false,
        denialReason: `Could not resolve doctor "${a.doctor}"`,
        result: { ok: false, reason: "doctor_not_found" },
      };
    }
    newDoctorId = doctor.id;
  }

  const { data, error } = await db().rpc("reschedule_appointment", {
    p_appointment_id: appointment.id,
    p_new_starts_at: a.new_starts_at,
    p_new_doctor_id: newDoctorId,
    p_actor: "ai",
    p_call_id: ctx.callId ?? undefined,
  });

  if (error) {
    const appErr = fromPostgrest(error, "rescheduling the appointment");
    return {
      allowed: false,
      denialReason: `${appErr.code}: ${appErr.message}`,
      result: { ok: false, reason: appErr.code, message: appErr.message, hint: appErr.hint },
    };
  }

  return {
    allowed: true,
    result: {
      ok: true,
      appointment_id: data.id,
      previous_starts_at: appointment.starts_at,
      starts_at: data.starts_at,
    },
  };
}

async function cancelAppointment(ctx: ToolContext, args: unknown): Promise<ToolOutcome> {
  const a = TOOL_ARG_SCHEMAS.cancel_appointment.parse(args);
  const { appointment, ambiguous } = await findUpcomingAppointment(
    ctx.clinicId,
    a.phone,
    a.patient_name,
  );

  if (ambiguous.length > 0) {
    return {
      allowed: false,
      denialReason: "Multiple patients share this phone number",
      result: { ok: false, reason: "ambiguous_patient", candidates: ambiguous },
    };
  }
  if (!appointment) {
    return {
      allowed: false,
      denialReason: "No upcoming appointment for this number",
      result: { ok: false, reason: "no_upcoming_appointment" },
    };
  }

  const { data, error } = await db().rpc("cancel_appointment", {
    p_appointment_id: appointment.id,
    p_actor: "ai",
    p_reason: a.reason ?? "Cancelled by caller",
    p_call_id: ctx.callId ?? undefined,
  });

  if (error) {
    // Most often this is `ai_may_cancel = false` — the clinic has not opted in.
    // The model is told to hand off, not to try again.
    const appErr = fromPostgrest(error, "cancelling the appointment");
    return {
      allowed: false,
      denialReason: `${appErr.code}: ${appErr.message}`,
      result: {
        ok: false,
        reason: appErr.code,
        message: appErr.message,
        hint: appErr.hint ?? "Tell the caller a staff member will confirm the cancellation.",
      },
    };
  }

  return { allowed: true, result: { ok: true, appointment_id: data.id, status: data.status } };
}

const IMPLEMENTATIONS: Record<
  ToolName,
  (ctx: ToolContext, args: unknown) => Promise<ToolOutcome>
> = {
  check_availability: checkAvailability,
  book_appointment: bookAppointment,
  reschedule_appointment: rescheduleAppointment,
  cancel_appointment: cancelAppointment,
};

/**
 * Runs a tool and records the attempt.
 *
 * Every invocation is written to `call_tool_invocations` — including refusals,
 * with the reason. A denied booking auto-raises a `booking_conflict` action
 * item via trigger, so a guard rail firing mid-call becomes visible to staff
 * instead of vanishing into a transcript.
 */
export async function executeTool(
  ctx: ToolContext,
  name: string,
  args: unknown,
): Promise<ToolOutcome> {
  const startedAt = Date.now();
  let outcome: ToolOutcome;

  if (!(name in IMPLEMENTATIONS)) {
    outcome = {
      allowed: false,
      denialReason: `Unknown tool "${name}"`,
      result: { ok: false, reason: "unknown_tool" },
    };
  } else {
    try {
      outcome = await IMPLEMENTATIONS[name as ToolName](ctx, args);
    } catch (err) {
      const message =
        err instanceof AppError ? err.message : err instanceof Error ? err.message : String(err);
      logger.error({ err, tool: name, clinicId: ctx.clinicId }, "tool execution failed");
      outcome = {
        allowed: false,
        denialReason: message,
        result: { ok: false, reason: "tool_error", message },
      };
    }
  }

  if (ctx.callId) {
    const { error } = await dbAdmin.from("call_tool_invocations").insert({
      clinic_id: ctx.clinicId,
      call_id: ctx.callId,
      turn_id: ctx.turnId ?? null,
      tool_name: name,
      arguments: (args ?? {}) as Json,
      allowed: outcome.allowed,
      denial_reason: outcome.allowed ? null : (outcome.denialReason ?? "unspecified"),
      result: outcome.result as Json,
      latency_ms: Date.now() - startedAt,
    });
    if (error) {
      logger.error({ err: error, tool: name }, "failed to record tool invocation");
    }
  }

  return outcome;
}
