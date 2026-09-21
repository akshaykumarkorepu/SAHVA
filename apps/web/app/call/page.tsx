"use client";

import { useState } from "react";
import Link from "next/link";
import { useVoiceSession } from "@/components/voice/useVoiceSession";
import { MicButton } from "@/components/voice/MicButton";
import { Transcript } from "@/components/voice/Transcript";
import { WhatsAppPreview } from "@/components/whatsapp/WhatsAppPreview";
import { Button, Card } from "@/components/ui";

export default function CallPage() {
  const v = useVoiceSession();
  const [text, setText] = useState("");

  const onSendText = async () => {
    if (!text.trim()) return;
    const t = text.trim();
    setText("");
    await v.sendTurn(t);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-primary-50/40 to-white">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
              <span className="text-lg">🩺</span>
            </div>
            <div className="text-sm font-semibold text-ink-900">ClinicVoice AI · Live call</div>
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-600" />
            </span>
            <span className="font-medium text-ink-700">Maya (AI receptionist)</span>
            <Link
              href="/dashboard"
              className="ml-3 rounded-md border border-ink-300 px-2 py-1 text-ink-700 hover:bg-ink-100"
            >
              Dashboard →
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <Card className="p-6">
              <Transcript turns={v.history} />
              <div className="mt-6 flex flex-col items-center gap-3">
                <MicButton
                  listening={v.listening}
                  thinking={v.thinking}
                  speaking={v.speaking}
                  supported={v.supported}
                  onStart={v.startListening}
                  onStop={v.stopListening}
                />
                {v.transcript && v.listening && (
                  <div className="rounded-md bg-ink-100 px-3 py-2 text-sm text-ink-700">
                    “{v.transcript}”
                  </div>
                )}
                {v.error && (
                  <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{v.error}</div>
                )}

                <form
                  className="mt-2 flex w-full max-w-md gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSendText();
                  }}
                >
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type instead of speaking…"
                    className="flex-1 rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                  <Button type="submit">Send</Button>
                </form>

                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-ink-500">
                  <span>Try:</span>
                  {[
                    "I want to book an appointment with Dr. Anitha Reddy tomorrow at 10 AM",
                    "నాకు డాక్టర్ అనిత రెడ్డి గారిని కలవాలి",
                    "Cancel my appointment — 9876543210",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setText(s)}
                      className="rounded-full border border-ink-100 bg-white px-3 py-1 hover:border-primary-300 hover:text-primary-700"
                    >
                      {s.length > 38 ? s.slice(0, 38) + "…" : s}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <Button variant="outline" onClick={v.reset}>
                    Reset
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const lastUser = [...v.history].reverse().find((t) => t.role === "user")?.content;
                      await v.endCall(
                        lastUser ? "inquiry" : "inquiry",
                        "Demo call ended"
                      );
                      v.reset();
                    }}
                  >
                    End call
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-ink-900">How this works</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-700">
                <li>Browser captures your voice (Web Speech API).</li>
                <li>Text is sent to <code className="rounded bg-ink-100 px-1">/api/voice/turn</code>.</li>
                <li>Claude Sonnet 4.6 replies, optionally calling tools.</li>
                <li>Browser speaks the reply out loud.</li>
              </ol>
            </Card>

            {v.preview && <WhatsAppPreview preview={v.preview} />}

            <Card className="p-4 text-xs text-ink-500">
              Tip: the receptionist mirrors your language. Speak in Telugu and she&apos;ll reply in Telugu.
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
