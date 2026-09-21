import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, mkdirSync } from "node:fs";
import { config } from "dotenv";

config(); // loads .env from repo root if present

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../../data");
mkdirSync(dataDir, { recursive: true });

export const DB_PATH = resolve(dataDir, "clinicvoice.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Run migration on import
const schemaPath = resolve(__dirname, "schema.sql");
const ddl = readFileSync(schemaPath, "utf8");
db.exec(ddl);

export type Clinic = {
  id: number;
  name: string;
  city: string | null;
  phone: string | null;
  created_at: string;
};
export type Doctor = {
  id: number;
  clinic_id: number;
  name: string;
  specialty: string | null;
  languages: string;
  created_at: string;
};
export type Patient = {
  id: number;
  clinic_id: number;
  name: string;
  phone: string;
  preferred_language: string | null;
  created_at: string;
};
export type Appointment = {
  id: number;
  clinic_id: number;
  patient_id: number;
  doctor_id: number;
  starts_at: string;
  duration_min: number;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};
export type Call = {
  id: number;
  clinic_id: number;
  patient_id: number | null;
  started_at: string;
  ended_at: string | null;
  outcome: string | null;
  language: string | null;
  transcript: string;
  summary: string | null;
  was_missed_before_ai: number;
};
