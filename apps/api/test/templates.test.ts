import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { fillTemplate, pickTemplate } from "../src/lib/templates.js";

const t = (clinic_id: string | null, language: "te" | "en" | "hi", body: string) => ({
  clinic_id,
  language,
  body,
});

test("a clinic's own template beats the Sahva default", () => {
  const pick = pickTemplate([t(null, "te", "default te"), t("c1", "te", "clinic te")], "te");
  assert.equal(pick?.body, "clinic te");
});

test("the patient's language wins over the clinic's own English row", () => {
  const pick = pickTemplate([t("c1", "en", "clinic en"), t(null, "te", "default te")], "te");
  assert.equal(pick?.body, "default te");
});

test("falls back rather than sending nothing when the language is missing", () => {
  // A confirmation in the wrong language still beats a patient who does not
  // know they have an appointment.
  const pick = pickTemplate([t(null, "en", "default en")], "te");
  assert.equal(pick?.body, "default en");
});

test("no candidates means no template", () => {
  assert.equal(pickTemplate([], "te"), undefined);
});

test("fills variables", () => {
  const out = fillTemplate("Namaste {{patient_name}}, {{doctor_name}} at {{date_time}}.", {
    patient_name: "Lakshmi",
    doctor_name: "Dr Anitha",
    date_time: "Fri 10:00 am",
  });
  assert.equal(out, "Namaste Lakshmi, Dr Anitha at Fri 10:00 am.");
});

test("an unknown placeholder is left visible, not blanked", () => {
  // A broken template should be obvious in the preview rather than reaching a
  // patient as a hole in a sentence.
  assert.equal(fillTemplate("Hello {{nope}}", {}), "Hello {{nope}}");
});

test("the same variable can appear more than once", () => {
  assert.equal(fillTemplate("{{a}} and {{a}}", { a: "x" }), "x and x");
});

test("Telugu template bodies survive substitution", () => {
  const out = fillTemplate("నమస్తే {{patient_name}} గారు", { patient_name: "లక్ష్మి" });
  assert.equal(out, "నమస్తే లక్ష్మి గారు");
});
