"use client";

import { supabase } from "./supabase";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

/**
 * A typed failure from the API. The server always returns
 *   { error: { code, message, detail?, hint? }, requestId }
 * so the UI switches on `code`, never on message text.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: string,
    readonly hint?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The no-double-booking constraint fired — the slot genuinely went. */
  get isSlotTaken() {
    return this.code === "SLOT_TAKEN";
  }
  get isAuthError() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Fall through to the generic error below.
  }

  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string; detail?: string; hint?: string }; requestId?: string })?.error;
    throw new ApiError(
      res.status,
      e?.code ?? "UNKNOWN",
      e?.message ?? `Request failed (${res.status})`,
      e?.detail,
      e?.hint,
      (body as { requestId?: string })?.requestId,
    );
  }

  return body as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, payload?: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(payload ?? {}) });
export const patch = <T,>(path: string, payload: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(payload) });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });
