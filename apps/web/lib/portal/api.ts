"use client";

import { ApiError } from "@/lib/api";
import type { Enums } from "@sahva/types";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

/**
 * Portal API client.
 *
 * Deliberately separate from lib/api.ts: this one never attaches a Supabase
 * session, because a patient does not have one. The link in the URL is the
 * only credential, and it travels in the path.
 */
export async function portalFetch<T>(
  token: string,
  path = "",
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}/api/portal/${encodeURIComponent(token)}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }

  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string; detail?: string; hint?: string } })?.error;
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

export type PortalAppointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  status: Enums<"appointment_status">;
  reason: string | null;
  token_number: number | null;
  confirmed_at: string | null;
  doctor_name: string;
  doctor_specialty: string;
  doctor_colour: string;
  consult_fee_paise: number | null;
  clinic_name: string;
  clinic_phone: string;
  address_line: string | null;
  landmark: string | null;
  city: string;
  map_url: string | null;
  timezone: string;
};

export type PortalData = {
  patient: {
    id: string;
    full_name: string;
    phone_e164: string;
    preferred_language: Enums<"language_code">;
  };
  clinic: {
    id: string;
    name: string;
    phone_e164: string;
    whatsapp_e164: string | null;
    address_line: string | null;
    landmark: string | null;
    city: string;
    pincode: string | null;
    map_url: string | null;
    timezone: string;
    default_language: Enums<"language_code">;
  };
  permissions: { may_reschedule: boolean; may_cancel: boolean };
  upcoming: PortalAppointment[];
  past: PortalAppointment[];
};

export type PortalSlot = { slot_start: string; slot_end: string; remaining: number };
