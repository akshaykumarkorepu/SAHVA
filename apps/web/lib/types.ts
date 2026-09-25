import type { Enums, Tables, Views } from "@sahva/types";

/** Shapes the API returns. Kept next to the client so drift is one file. */

export type ActionItem = Views<"v_open_action_items">;
export type Appointment = Tables<"appointments">;
export type Doctor = Tables<"doctors">;
export type Patient = Tables<"patients">;
export type Call = Tables<"calls">;
export type Clinic = Tables<"clinics">;

export type AppointmentWithJoins = Appointment & {
  doctors: Pick<Doctor, "id" | "spoken_name" | "specialty" | "colour_hex"> | null;
  patients: Pick<Patient, "id" | "full_name" | "phone_e164" | "preferred_language"> | null;
};

export type TodayAppointment = Views<"v_todays_appointments">;

export type RescheduleBatch = Tables<"reschedule_batches"> & {
  doctors: Pick<Doctor, "spoken_name" | "specialty"> | null;
  items: (Tables<"reschedule_batch_items"> & {
    patients: Pick<Patient, "id" | "full_name" | "phone_e164" | "preferred_language"> | null;
    appointments: Pick<Appointment, "id" | "starts_at" | "status"> | null;
  })[];
};

export type Paged<T> = { data: T[]; count: number; limit: number; offset: number };

export type Slot = { slot_start: string; slot_end: string; remaining: number };

export type AnalyticsSummary = {
  window_days: number;
  totals: {
    calls: number;
    answered: number;
    bookings: number;
    reschedules: number;
    recovered_missed: number;
    escalations: number;
    telugu_calls: number;
    english_calls: number;
    conversion_rate: number;
  };
  open_action_items: { total: number; urgent: number; high: number };
  cost: { total_inr: number; per_call_inr: number };
  daily: {
    day: string;
    total_calls: number;
    bookings: number;
    recovered_missed: number;
    telugu_calls: number;
    english_calls: number;
  }[];
};

export type Me = {
  user_id: string;
  email: string | null;
  clinic_id: string;
  role: Enums<"staff_role">;
};
