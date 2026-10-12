/** The shapes the patient API returns (GET /me, /me/medical, /me/tasks, /me/invoices). */

export type Visit = {
  id: string;
  chief_complaint: string | null;
  diagnosis_text: string | null;
  advice: string | null;
  follow_up_days: number | null;
  finalised_at: string | null;
  visited_at: string | null;
  doctor_name: string;
  doctor_specialty: string;
  doctor_colour: string;
};

export type RxItem = {
  drug_name: string;
  strength: string | null;
  form: string | null;
  dosage: string | null;
  frequency: string | null;
  duration_days: number | null;
  instructions_en: string | null;
  instructions_te: string | null;
};

export type Prescription = {
  id: string;
  issued_at: string;
  notes: string | null;
  doctor_name: string;
  items: RxItem[];
};

export type ConditionStatus = "active" | "chronic" | "resolved";

export type Condition = {
  id: string;
  condition: string;
  status: ConditionStatus;
  onset_date: string | null;
  resolved_date: string | null;
};

export type VaccinationStatus = "due" | "administered" | "overdue" | "skipped";

export type Vaccination = {
  id: string;
  vaccine_code: string;
  dose_number: number;
  due_date: string | null;
  administered_at: string | null;
  status: VaccinationStatus;
  vaccine_catalogue: { name: string; description: string | null } | null;
};

export type Medical = {
  visits: Visit[];
  prescriptions: Prescription[];
  conditions: Condition[];
  vaccinations: Vaccination[];
};

/**
 * A scheduled follow-up, as GET /me/tasks returns it.
 *
 * The text comes from the care plan the task was generated from — care_tasks
 * itself carries none. Read-only on purpose: care_task_status tracks the
 * clinic's dispatch (`pending → sent`), not something a patient ticks off.
 */
export type CareTask = {
  id: string;
  title: string;
  template_key: string | null;
  due_on: string;
  status: "pending" | "sent";
};

export type InvoiceStatus = "draft" | "issued" | "paid" | "void";

export type Invoice = {
  id: string;
  invoice_number: string;
  total_paise: number;
  status: InvoiceStatus;
  payment_mode: string | null;
  issued_at: string | null;
  paid_at: string | null;
  items: { description: string; quantity: number; unit_price_paise: number }[];
};

export type Tab = "overview" | "visits" | "medicines" | "vaccines" | "bills";

export type ClinicInfo = {
  name: string;
  phone_e164: string;
  address_line: string | null;
  landmark: string | null;
  city: string;
  map_url: string | null;
  timezone: string;
};

export type Appt = {
  id: string;
  starts_at: string;
  status: string;
  reason: string | null;
  doctor_name: string;
  doctor_specialty: string;
  consult_fee_paise: number | null;
  timezone: string;
};
