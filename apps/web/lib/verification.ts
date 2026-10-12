import type { Tone } from "@/components/ui";

/**
 * Clinic verification, as the owner and the reviewer see it. One source of
 * wording, so the banner, the form and the admin queue cannot drift apart.
 */

export type VerificationStatus = "submitted" | "under_review" | "needs_info" | "approved" | "rejected" | "suspended";

export const STATES = [
  "Telangana",
  "Andhra Pradesh",
  "Karnataka",
  "Maharashtra",
  "Tamil Nadu",
  "Odisha",
  "Chhattisgarh",
  "Other",
] as const;

export const COUNCILS = [
  "National Medical Commission (NMC)",
  "Telangana State Medical Council",
  "Andhra Pradesh Medical Council",
  "Karnataka Medical Council",
  "Maharashtra Medical Council",
  "Tamil Nadu Medical Council",
  "Other state medical council",
] as const;

export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PINCODE = /^[1-9][0-9]{5}$/;
export const HFR_ID = /^[A-Za-z0-9-]{6,32}$/;

export type ApplicationIds = {
  idType: "hfr" | "state";
  hfrId: string;
  regNo: string;
  regState: string;
  ownerRegNo: string;
  ownerCouncil: string;
  gstin: string;
};

/** What is still missing or malformed, in words; empty when ready to send. */
export function idProblems(a: ApplicationIds): string[] {
  const out: string[] = [];
  if (a.idType === "hfr") {
    if (!a.hfrId.trim()) out.push("The clinic's HFR ID");
    else if (!HFR_ID.test(a.hfrId.trim())) out.push("An HFR ID in letters and numbers only");
  } else {
    if (a.regNo.trim().length < 3) out.push("The state registration number");
    if (!a.regState) out.push("The state that issued it");
  }
  if (a.ownerRegNo.trim().length < 3) out.push("The owner doctor's registration number");
  if (!a.ownerCouncil) out.push("The council the doctor is registered with");
  if (a.gstin.trim() && !GSTIN.test(a.gstin.trim().toUpperCase())) out.push("A valid GSTIN (or leave it empty)");
  return out;
}

/** The owner-facing line for each status. */
export function ownerStatus(s: VerificationStatus): { tone: Tone; title: string; body: string } {
  switch (s) {
    case "submitted":
    case "under_review":
      return {
        tone: "info",
        title: "Your clinic is being verified",
        body: "Usually within one working day. Set up your doctors, hours and FAQs meanwhile — patients and the AI receptionist are switched on once approved, and your 14-day trial starts then.",
      };
    case "needs_info":
      return {
        tone: "warn",
        title: "SAHVA needs a little more information",
        body: "Read the note below, update your details or documents, and send it back.",
      };
    case "approved":
      return { tone: "good", title: "Verified", body: "Your clinic is approved and live." };
    case "rejected":
      return {
        tone: "bad",
        title: "Your application was not approved",
        body: "The reason is below. If you think this is a mistake, contact SAHVA support.",
      };
    case "suspended":
      return {
        tone: "bad",
        title: "Your clinic is suspended",
        body: "Nothing reaches patients until SAHVA reinstates it. The reason is below.",
      };
  }
}

/** The reviewer's label for a status. */
export const STATUS_LABEL: Record<VerificationStatus, { label: string; tone: Tone }> = {
  submitted: { label: "Submitted", tone: "info" },
  under_review: { label: "In review", tone: "info" },
  needs_info: { label: "Needs info", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  suspended: { label: "Suspended", tone: "bad" },
};

/** Which decisions a reviewer can take from each status — mirrors admin_review_clinic(). */
export function allowedDecisions(s: VerificationStatus): ("start_review" | "approve" | "needs_info" | "reject" | "suspend" | "reinstate")[] {
  switch (s) {
    case "submitted":
      return ["start_review", "approve", "needs_info", "reject"];
    case "under_review":
      return ["approve", "needs_info", "reject"];
    case "needs_info":
      return ["reject"];
    case "approved":
      return ["suspend"];
    case "suspended":
      return ["reinstate"];
    case "rejected":
      return [];
  }
}

export const NEEDS_REASON = new Set(["needs_info", "reject", "suspend"]);
