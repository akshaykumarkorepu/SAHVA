import { Router } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { phoneE164, uuid, validate } from "../middleware/validate.js";
import { badRequest, notFound, unwrap } from "../lib/errors.js";
import { dbAdmin } from "../lib/supabase.js";
import { anthropic, MODEL } from "../claude/client.js";
import { TOOL_DEFINITIONS } from "../claude/tools.js";
import { buildSystemPrompt, type ClinicBrief } from "../claude/systemPrompt.js";
import { executeTool } from "../tools/appointments.js";
import { recordUsage } from "../lib/usage.js";
import { detectLanguage } from "../lib/language.js";

export const voice = Router();

/**
 * The voice orchestrator.
 *
 * Every route here is a machine caller (telephony webhook or media bridge) and
 * is guarded by `requireServiceKey` where it is mounted — an inbound phone call
 * carries no user JWT. Tenancy is resolved from the DIALED number, which the
 * caller cannot choose, and then passed explicitly to every write.
 */

/** Clinic briefs change rarely and are read on every turn. Cache briefly. */
const BRIEF_TTL_MS = 60_000;
const briefCache = new Map<string, { brief: ClinicBrief; at: number }>();

async function getBrief(clinicId: string): Promise<ClinicBrief> {
  const hit = briefCache.get(clinicId);
  if (hit && Date.now() - hit.at < BRIEF_TTL_MS) return hit.brief;
  const brief = await buildSystemPrompt(clinicId);
  briefCache.set(clinicId, { brief, at: Date.now() });
  return brief;
}

/** True when the clinic is closed right now — used to set `recovered_missed`. */
async function isOutsideClinicHours(clinicId: string, timezone: string): Promise<boolean> {
  const local = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  const dow = local.getDay();
  const hhmm = `${String(local.getHours()).padStart(2, "0")}:${String(
    local.getMinutes(),
  ).padStart(2, "0")}`;

  const { data } = await dbAdmin
    .from("clinic_hours")
    .select("opens_at, closes_at")
    .eq("clinic_id", clinicId)
    .eq("day_of_week", dow);

  if (!data || data.length === 0) return true;
  return !data.some((h) => hhmm >= h.opens_at.slice(0, 5) && hhmm <= h.closes_at.slice(0, 5));
}

// ---------------------------------------------------------------------------
// Start a call
// ---------------------------------------------------------------------------

const startBody = z.object({
  provider: z
    .enum(["exotel", "twilio", "plivo", "knowlarity", "browser_demo"])
    .default("browser_demo"),
  provider_call_sid: z.string().min(1).max(200).optional(),
  from_e164: phoneE164,
  /** The number the patient dialled. This is how the tenant is resolved. */
  to_e164: phoneE164,
});

voice.post(
  "/calls",
  validate({ body: startBody }),
  asyncRoute(async (req, res) => {
    const b = req.body as z.infer<typeof startBody>;

    const clinic = await dbAdmin
      .from("clinics")
      .select("id, name, timezone, default_language, is_active")
      .eq("phone_e164", b.to_e164)
      .maybeSingle();

    if (!clinic.data) throw notFound(`Clinic for number ${b.to_e164}`);
    if (!clinic.data.is_active) throw badRequest("CLINIC_INACTIVE", "This clinic is not active.");

    const settings = await dbAdmin
      .from("clinic_settings")
      .select("ai_enabled, ai_answers_after_hours, greeting_te, greeting_en")
      .eq("clinic_id", clinic.data.id)
      .maybeSingle();

    if (settings.data && !settings.data.ai_enabled) {
      throw badRequest("AI_DISABLED", "The AI receptionist is switched off for this clinic.");
    }

    const afterHours = await isOutsideClinicHours(clinic.data.id, clinic.data.timezone);
    if (afterHours && settings.data && !settings.data.ai_answers_after_hours) {
      throw badRequest("AFTER_HOURS", "This clinic does not answer after hours.");
    }

    // Carriers retry webhooks, so the same SID must not create two calls.
    // `calls_provider_sid_idx` backs this upsert.
    const existing = b.provider_call_sid
      ? await dbAdmin
          .from("calls")
          .select("id")
          .eq("provider", b.provider)
          .eq("provider_call_sid", b.provider_call_sid)
          .maybeSingle()
      : { data: null };

    if (existing.data) {
      req.log.info({ callId: existing.data.id }, "duplicate call webhook ignored");
      return res.json({ call_id: existing.data.id, duplicate: true });
    }

    const call = unwrap(
      await dbAdmin
        .from("calls")
        .insert({
          clinic_id: clinic.data.id,
          provider: b.provider,
          provider_call_sid: b.provider_call_sid ?? null,
          direction: "inbound",
          from_e164: b.from_e164,
          to_e164: b.to_e164,
          status: "in_progress",
          answered_at: new Date().toISOString(),
          primary_language: clinic.data.default_language,
          // The whole pitch metric: this call would have gone unanswered.
          recovered_missed: afterHours,
        })
        .select()
        .single(),
      "call",
    );

    const greeting =
      (clinic.data.default_language === "te"
        ? settings.data?.greeting_te
        : settings.data?.greeting_en) ??
      `Namaste, welcome to ${clinic.data.name}. This is Maya. How may I help you?`;

    req.log.info(
      { callId: call.id, clinicId: clinic.data.id, afterHours },
      "call started",
    );

    // Greet in the transcript too, so the record is complete from turn 0.
    await dbAdmin.from("call_turns").insert({
      clinic_id: clinic.data.id,
      call_id: call.id,
      turn_index: 0,
      role: "assistant",
      content: greeting,
      language: clinic.data.default_language,
    });

    res.status(201).json({
      call_id: call.id,
      clinic: { id: clinic.data.id, name: clinic.data.name, timezone: clinic.data.timezone },
      greeting,
      language: clinic.data.default_language,
      recovered_missed: afterHours,
    });
  }),
);

// ---------------------------------------------------------------------------
// One turn
// ---------------------------------------------------------------------------

const turnBody = z.object({
  text: z.string().min(1).max(4000),
  language: z.enum(["te", "en", "hi"]).optional(),
  stt_confidence: z.number().min(0).max(1).optional(),
  /** Vendor seconds for this turn, so unit economics are measured, not estimated. */
  stt_seconds: z.number().min(0).max(600).optional(),
});

const MAX_TOOL_ROUNDS = 5;

voice.post(
  "/calls/:callId/turn",
  validate({ params: z.object({ callId: uuid }), body: turnBody }),
  asyncRoute(async (req, res) => {
    const startedAt = Date.now();
    const b = req.body as z.infer<typeof turnBody>;
    const callId = req.params.callId;

    const call = unwrap(
      await dbAdmin.from("calls").select("*").eq("id", callId).single(),
      "call",
    );
    if (call.status !== "in_progress") {
      throw badRequest("CALL_ENDED", "This call has already ended.");
    }

    const brief = await getBrief(call.clinic_id);
    const log = req.log.child({ callId, clinicId: call.clinic_id });

    // Telugu-English code-switching is the norm on these calls. Trust the STT
    // layer's label when it gives one, and fall back to script detection.
    const turnLanguage = b.language ?? detectLanguage(b.text);

    // --- Escalation check runs BEFORE the model sees anything. A medical
    // emergency must not depend on the model choosing to escalate.
    const lower = b.text.toLowerCase();
    const matched = brief.escalationKeywords.find((k) => lower.includes(k.toLowerCase()));

    // Rebuild the conversation from the database. The server holds the session;
    // nothing is trusted from the client. A phone call has no browser.
    const priorTurns = unwrap(
      await dbAdmin
        .from("call_turns")
        .select("turn_index, role, content")
        .eq("call_id", callId)
        .in("role", ["assistant", "caller"])
        .order("turn_index"),
      "call turns",
    );

    const nextIndex = (priorTurns.at(-1)?.turn_index ?? -1) + 1;

    const callerTurn = unwrap(
      await dbAdmin
        .from("call_turns")
        .insert({
          clinic_id: call.clinic_id,
          call_id: callId,
          turn_index: nextIndex,
          role: "caller",
          content: b.text,
          language: turnLanguage,
          stt_confidence: b.stt_confidence ?? null,
        })
        .select()
        .single(),
      "call turn",
    );

    if (matched) {
      const reply =
        brief.defaultLanguage === "te"
          ? "ఇది అత్యవసర పరిస్థితిలా ఉంది. దయచేసి వెంటనే సమీప ఆసుపత్రికి వెళ్లండి లేదా 108కి కాల్ చేయండి. మా సిబ్బంది మీకు తిరిగి కాల్ చేస్తారు."
          : "This sounds like an emergency. Please go to the nearest hospital or call 108 right away. A staff member will call you back.";

      await dbAdmin.from("call_turns").insert({
        clinic_id: call.clinic_id,
        call_id: callId,
        turn_index: nextIndex + 1,
        role: "assistant",
        content: reply,
        language: brief.defaultLanguage,
        latency_ms: Date.now() - startedAt,
      });
      await dbAdmin
        .from("calls")
        .update({ escalated_to_human: true, intent: "emergency" })
        .eq("id", callId);

      log.warn({ keyword: matched }, "call escalated on keyword");
      return res.json({ text: reply, escalate: true, tool_calls: [], end_call: true });
    }

    // --- Model loop -------------------------------------------------------
    const messages: Anthropic.MessageParam[] = priorTurns
      .filter((t) => t.turn_index > 0 || t.role === "assistant")
      .map((t) => ({
        role: t.role === "caller" ? ("user" as const) : ("assistant" as const),
        content: t.content,
      }));
    messages.push({ role: "user", content: b.text });

    const toolCalls: { name: string; allowed: boolean; result: unknown }[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let replyText = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: brief.prompt,
        tools: TOOL_DEFINITIONS,
        messages,
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      replyText = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();

      const toolUses = response.content.filter(
        (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
      );
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

      messages.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const outcome = await executeTool(
          { clinicId: call.clinic_id, callId, turnId: callerTurn.id },
          use.name,
          use.input,
        );
        toolCalls.push({ name: use.name, allowed: outcome.allowed, result: outcome.result });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(outcome.result),
          is_error: !outcome.allowed,
        });
      }
      messages.push({ role: "user", content: results });
    }

    if (!replyText) {
      replyText =
        brief.defaultLanguage === "te"
          ? "క్షమించండి, మళ్లీ చెప్పగలరా?"
          : "Sorry, could you say that again?";
    }

    const latencyMs = Date.now() - startedAt;

    await dbAdmin.from("call_turns").insert({
      clinic_id: call.clinic_id,
      call_id: callId,
      turn_index: nextIndex + 1,
      role: "assistant",
      content: replyText,
      language: turnLanguage,
      latency_ms: latencyMs,
    });

    // Metered as it happens, not reconstructed later from guesses.
    await recordUsage(call.clinic_id, callId, [
      { kind: "llm_input_tokens", provider: "anthropic", quantity: inputTokens },
      { kind: "llm_output_tokens", provider: "anthropic", quantity: outputTokens },
      { kind: "tts_characters", provider: "sarvam", quantity: replyText.length },
      ...(b.stt_seconds
        ? ([{ kind: "stt_seconds", provider: "sarvam", quantity: b.stt_seconds }] as const)
        : []),
    ]);

    if (!call.languages_detected.includes(turnLanguage)) {
      await dbAdmin
        .from("calls")
        .update({ languages_detected: [...call.languages_detected, turnLanguage] })
        .eq("id", callId);
    }

    if (latencyMs > 2000) {
      log.warn({ latencyMs }, "turn exceeded the conversational latency budget");
    }

    res.json({ text: replyText, tool_calls: toolCalls, escalate: false, latency_ms: latencyMs });
  }),
);

// ---------------------------------------------------------------------------
// End a call
// ---------------------------------------------------------------------------

const endBody = z.object({
  status: z.enum(["completed", "abandoned", "failed", "transferred"]).default("completed"),
  duration_sec: z.number().int().min(0).max(7200).optional(),
  recording_url: z.string().url().optional(),
});

voice.post(
  "/calls/:callId/end",
  validate({ params: z.object({ callId: uuid }), body: endBody }),
  asyncRoute(async (req, res) => {
    const b = req.body as z.infer<typeof endBody>;
    const callId = req.params.callId;

    const call = unwrap(
      await dbAdmin.from("calls").select("*").eq("id", callId).single(),
      "call",
    );

    const [turns, tools] = await Promise.all([
      dbAdmin
        .from("call_turns")
        .select("role, content, stt_confidence")
        .eq("call_id", callId)
        .order("turn_index"),
      dbAdmin
        .from("call_tool_invocations")
        .select("tool_name, allowed")
        .eq("call_id", callId),
    ]);

    // Outcome is derived from what actually happened in the database, not from
    // what the model said it did.
    const succeeded = (tools.data ?? []).filter((t) => t.allowed);
    const outcome = succeeded.some((t) => t.tool_name === "book_appointment")
      ? "booked"
      : succeeded.some((t) => t.tool_name === "reschedule_appointment")
        ? "rescheduled"
        : succeeded.some((t) => t.tool_name === "cancel_appointment")
          ? "cancelled"
          : call.escalated_to_human
            ? "escalated"
            : succeeded.some((t) => t.tool_name === "check_availability")
              ? "unresolved"
              : "faq_answered";

    const callerTurns = (turns.data ?? []).filter(
      (t) => t.role === "caller" && t.stt_confidence !== null,
    );
    const avgConfidence =
      callerTurns.length > 0
        ? callerTurns.reduce((s, t) => s + Number(t.stt_confidence), 0) / callerTurns.length
        : null;

    const endedAt = new Date();
    const durationSec =
      b.duration_sec ??
      Math.max(0, Math.round((endedAt.getTime() - new Date(call.started_at).getTime()) / 1000));

    // This UPDATE fires `calls_flag_for_review`, which opens an action item for
    // an escalation, an unresolved call, or a low-confidence booking.
    const updated = unwrap(
      await dbAdmin
        .from("calls")
        .update({
          status: b.status,
          outcome,
          ended_at: endedAt.toISOString(),
          duration_sec: durationSec,
          stt_confidence_avg: avgConfidence,
          recording_url: b.recording_url ?? null,
        })
        .eq("id", callId)
        .select()
        .single(),
      "call",
    );

    await recordUsage(call.clinic_id, callId, [
      { kind: "telephony_seconds", provider: call.provider, quantity: durationSec },
    ]);

    // Summarise for the dashboard. Failing to summarise must not fail the call.
    const transcript = (turns.data ?? [])
      .map((t) => `${t.role === "caller" ? "Caller" : "Maya"}: ${t.content}`)
      .join("\n");

    try {
      const summary = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 300,
        system:
          "Summarise this clinic reception call in at most two sentences for clinic staff. " +
          "State what the caller wanted and what actually happened. Do not invent detail. " +
          "Reply as JSON: {\"summary_en\": string, \"follow_up_needed\": boolean}.",
        messages: [{ role: "user", content: transcript.slice(0, 12_000) }],
      });

      const text = summary.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join("");
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
        summary_en: string;
        follow_up_needed: boolean;
      };

      await dbAdmin.from("call_summaries").upsert({
        call_id: callId,
        clinic_id: call.clinic_id,
        summary_en: parsed.summary_en,
        follow_up_needed: Boolean(parsed.follow_up_needed),
      });

      await recordUsage(call.clinic_id, callId, [
        {
          kind: "llm_input_tokens",
          provider: "anthropic",
          quantity: summary.usage.input_tokens,
        },
        {
          kind: "llm_output_tokens",
          provider: "anthropic",
          quantity: summary.usage.output_tokens,
        },
      ]);
    } catch (err) {
      req.log.error({ err, callId }, "call summary generation failed");
    }

    req.log.info({ callId, outcome, durationSec }, "call ended");
    res.json(updated);
  }),
);

/** Transcript for a live call — lets an operator watch a pilot call in real time. */
voice.get(
  "/calls/:callId",
  validate({ params: z.object({ callId: uuid }) }),
  asyncRoute(async (req, res) => {
    const callId = req.params.callId;
    const [call, turns] = await Promise.all([
      dbAdmin.from("calls").select("*").eq("id", callId).single(),
      dbAdmin.from("call_turns").select("*").eq("call_id", callId).order("turn_index"),
    ]);
    res.json({ ...unwrap(call, "call"), turns: turns.data ?? [] });
  }),
);
