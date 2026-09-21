import { Router } from "express";
import { db } from "../db/client.js";
import { anthropic, MODEL } from "../claude/client.js";
import { buildSystemPrompt } from "../claude/systemPrompt.js";
import { TOOL_DEFS } from "../claude/tools.js";
import {
  bookAppointment,
  cancelAppointment,
  checkAvailability,
  rescheduleAppointment,
} from "../tools/appointments.js";
import { buildWhatsAppPreview } from "../lib/whatsapp.js";
import { detectLanguage } from "../lib/language.js";

export const voice = Router();

type TurnBody = {
  callId?: string | number;
  userText: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

voice.post("/turn", async (req, res) => {
  try {
    const { userText, history = [] } = req.body as TurnBody;
    if (!userText || typeof userText !== "string") {
      return res.status(400).json({ error: "userText is required" });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set on the server." });
    }

    // Lazy create / fetch the call
    const callId = await ensureCall(req.body.callId, userText);

    const detectedLanguage = detectLanguage(userText);
    const sysPrompt = buildSystemPrompt();

    // Tool dispatch
    const dispatch = async (name: string, input: unknown) => {
      switch (name) {
        case "check_availability":
          return checkAvailability(input as Parameters<typeof checkAvailability>[0]);
        case "book_appointment":
          return bookAppointment(input as Parameters<typeof bookAppointment>[0]);
        case "reschedule_appointment":
          return rescheduleAppointment(input as Parameters<typeof rescheduleAppointment>[0]);
        case "cancel_appointment":
          return cancelAppointment(input as Parameters<typeof cancelAppointment>[0]);
        default:
          return { ok: false, error: `Unknown tool ${name}` };
      }
    };

    // Conversation history in Anthropic format
    const messages: { role: "user" | "assistant"; content: string }[] = [
      ...history,
      { role: "user", content: userText },
    ];

    let response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: sysPrompt,
      tools: TOOL_DEFS,
      messages,
    });

    const toolCalls: { name: string; input: unknown; result: unknown }[] = [];
    let whatsappPreview: ReturnType<typeof buildWhatsAppPreview> = null;

    // Tool-use loop (the model may chain several tool calls)
    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];

      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;
        const result = await dispatch(block.name, block.input);
        toolCalls.push({ name: block.name, input: block.input, result });

        // After successful booking, build WhatsApp preview
        if (
          block.name === "book_appointment" &&
          isOk(result) &&
          "appointment_id" in result.data
        ) {
          whatsappPreview = buildWhatsAppPreview(result.data.appointment_id);
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: sysPrompt,
        tools: TOOL_DEFS,
        messages: [
          ...messages,
          { role: "assistant", content: response.content as any },
          { role: "user", content: toolResults as any },
        ],
      });
    }

    const assistantText =
      response.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n")
        .trim() || "…";

    appendToTranscript(callId, [
      { role: "user", content: userText, ts: new Date().toISOString() },
      ...toolCalls.map((t) => ({
        role: "system" as const,
        content: `tool ${t.name}: ${JSON.stringify(t.result)}`,
        ts: new Date().toISOString(),
      })),
      { role: "assistant", content: assistantText, ts: new Date().toISOString() },
      ...(whatsappPreview
        ? [
            {
              role: "system" as const,
              content: `whatsapp_preview: ${whatsappPreview.message}`,
              ts: new Date().toISOString(),
            },
          ]
        : []),
    ]);

    res.json({
      callId,
      assistantText,
      detectedLanguage,
      toolCalls: toolCalls.map((t) => ({ name: t.name, input: t.input, result: t.result })),
      whatsappPreview,
    });
  } catch (err) {
    console.error("[voice/turn]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "voice turn failed" });
  }
});

voice.post("/end", (req, res) => {
  const { callId, outcome, summary, language } = req.body as {
    callId: number | string;
    outcome?: string;
    summary?: string;
    language?: string;
  };
  if (!callId) return res.status(400).json({ error: "callId required" });
  db.prepare(
    `UPDATE calls SET ended_at = datetime('now'), outcome = COALESCE(?, outcome), summary = COALESCE(?, summary), language = COALESCE(?, language) WHERE id = ?`
  ).run(outcome || null, summary || null, language || null, callId);
  res.json({ ok: true });
});

// --- helpers ---

function isOk(r: { ok: boolean }): r is { ok: true; data: unknown } {
  return r.ok;
}

function getClinicId(): number {
  const row = db.prepare("SELECT id FROM clinics ORDER BY id ASC LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (!row) throw new Error("No clinic");
  return row.id;
}

async function ensureCall(callId: number | string | undefined, firstUserText: string): Promise<number> {
  if (callId) {
    const id = Number(callId);
    const exists = db.prepare("SELECT id FROM calls WHERE id = ?").get(id);
    if (exists) return id;
  }
  const clinicId = getClinicId();
  const result = db
    .prepare("INSERT INTO calls (clinic_id, started_at) VALUES (?, datetime('now'))")
    .run(clinicId);
  const id = Number(result.lastInsertRowid);
  appendToTranscript(id, [
    { role: "user", content: firstUserText, ts: new Date().toISOString() },
  ]);
  return id;
}

function appendToTranscript(callId: number, entries: { role: string; content: string; ts: string }[]) {
  const row = db.prepare("SELECT transcript FROM calls WHERE id = ?").get(callId) as
    | { transcript: string }
    | undefined;
  const existing: unknown[] = row ? safeParse(row.transcript) : [];
  const next = JSON.stringify([...existing, ...entries]);
  db.prepare("UPDATE calls SET transcript = ? WHERE id = ?").run(next, callId);
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}
