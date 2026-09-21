"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CallTurn, WhatsAppPreview } from "@/lib/api";

type Role = "user" | "assistant" | "system";

type Turn = { role: Role; content: string; ts: string };

type VoiceTurnResponse = {
  callId: number;
  assistantText: string;
  detectedLanguage: "en" | "te";
  toolCalls: { name: string; input: unknown; result: unknown }[];
  whatsappPreview: WhatsAppPreview | null;
};

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

const SR =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

export function useVoiceSession() {
  const [history, setHistory] = useState<Turn[]>([
    {
      role: "assistant",
      content: "Hello, Sri Sai Clinic. This is Maya. How may I help you?",
      ts: new Date().toISOString(),
    },
  ]);
  const [callId, setCallId] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WhatsAppPreview | null>(null);

  const recogRef = useRef<any>(null);
  const ttsRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string, lang: "en" | "te") => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "te" ? "te-IN" : "en-IN";
    u.rate = 1.0;
    u.pitch = 1.0;
    // Try to pick a voice that matches the language
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((v) => v.lang === u.lang) || voices.find((v) => v.lang.startsWith("en")) || null;
    if (v) u.voice = v;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    ttsRef.current = u;
    window.speechSynthesis.speak(u);
  }, []);

  const sendTurn = useCallback(
    async (userText: string) => {
      setThinking(true);
      setError(null);
      const now = new Date().toISOString();
      setHistory((h) => [...h, { role: "user", content: userText, ts: now }]);

      try {
        const r = await fetch("/api/voice/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ callId, userText, history }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${r.status}`);
        }
        const data: VoiceTurnResponse = await r.json();
        setCallId(data.callId);
        if (data.whatsappPreview) setPreview(data.whatsappPreview);
        setHistory((h) => [
          ...h,
          { role: "assistant", content: data.assistantText, ts: new Date().toISOString() },
        ]);
        // Speak the assistant's reply in the detected language
        speak(data.assistantText, data.detectedLanguage);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "voice turn failed";
        setError(msg);
      } finally {
        setThinking(false);
      }
    },
    [callId, history, speak]
  );

  const startListening = useCallback(() => {
    if (!SR) {
      setError("Speech recognition is not supported in this browser. Use Chrome on desktop.");
      return;
    }
    setError(null);
    setTranscript("");
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    // auto language: leave default (en-IN) — Telugu text is captured too
    r.lang = "en-IN";
    r.onresult = (e: any) => {
      let txt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        txt += e.results[i][0].transcript;
      }
      setTranscript(txt);
    };
    r.onend = () => {
      setListening(false);
      const final = transcriptRef.current.trim();
      if (final) sendTurn(final);
    };
    r.onerror = (e: any) => {
      setListening(false);
      if (e.error && e.error !== "no-speech") {
        setError(`Mic error: ${e.error}`);
      }
    };
    recogRef.current = r;
    setListening(true);
    r.start();
  }, [sendTurn]);

  // Keep an up-to-date ref to the latest transcript text for the onend callback
  const transcriptRef = useRef("");
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const stopListening = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    window.speechSynthesis?.cancel();
    setHistory([
      {
        role: "assistant",
        content: "Hello, Sri Sai Clinic. This is Maya. How may I help you?",
        ts: new Date().toISOString(),
      },
    ]);
    setCallId(null);
    setPreview(null);
    setTranscript("");
    setError(null);
  }, []);

  // End the call gracefully
  const endCall = useCallback(
    async (outcome?: string, summary?: string) => {
      window.speechSynthesis?.cancel();
      if (callId) {
        const lastUser = [...history].reverse().find((t) => t.role === "user")?.content;
        const lang = /[ఀ-౿]/.test(lastUser || "") ? "te" : "en";
        await fetch("/api/voice/end", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ callId, outcome, summary, language: lang }),
        }).catch(() => null);
      }
    },
    [callId, history]
  );

  return {
    history,
    callId,
    listening,
    speaking,
    thinking,
    transcript,
    error,
    preview,
    startListening,
    stopListening,
    sendTurn, // exposed for the text input fallback
    reset,
    endCall,
    supported: Boolean(SR),
  } as const;
}

export type { Turn as VoiceTurn, CallTurn };
