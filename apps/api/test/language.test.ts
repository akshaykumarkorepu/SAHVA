import test from "node:test";
import assert from "node:assert/strict";
import { detectLanguage } from "../src/lib/language.js";

test("detects Telugu script", () => {
  assert.equal(detectLanguage("నాకు డాక్టర్ అనిత గారిని కలవాలి"), "te");
});

test("detects English", () => {
  assert.equal(detectLanguage("I want to book an appointment"), "en");
});

test("code-switching counts as Telugu when any Telugu appears", () => {
  // Mid-sentence switching is the norm on these calls, not the exception.
  assert.equal(detectLanguage("10 o'clock సరే, Ravi Kumar"), "te");
});

test("digits and punctuation alone are treated as English", () => {
  assert.equal(detectLanguage("9876543210"), "en");
  assert.equal(detectLanguage(""), "en");
});
