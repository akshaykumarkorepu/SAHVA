import { test } from "node:test";
import assert from "node:assert/strict";
import { STRINGS } from "../lib/portal/i18n";
import { aheadText, fill, portalError, shareText } from "../lib/portal/text";
import { ApiError } from "../lib/api";

test("fill replaces known placeholders and leaves unknown ones visible", () => {
  assert.equal(fill("{a} and {b}", { a: 1 }), "1 and {b}");
});

test("aheadText reads naturally for 0, 1 and many, in both languages", () => {
  for (const t of [STRINGS.en, STRINGS.te]) {
    assert.equal(aheadText(0, t), t.aheadNone);
    assert.equal(aheadText(1, t), t.aheadOne);
    assert.match(aheadText(4, t), /4/);
  }
});

test("the share text has every detail filled and never the portal link", () => {
  for (const t of [STRINGS.en, STRINGS.te]) {
    const text = shareText(t, {
      name: "Lakshmi Devi",
      when: "Tue 13 Oct, 10:00 am",
      doctor: "Dr Anitha",
      clinic: "Sri Sai Clinic",
      place: "Station Road, Warangal",
      phone: "+91 98480 12345",
    });
    assert.doesNotMatch(text, /\{\w+\}/, "unfilled placeholder");
    assert.doesNotMatch(text, /\/p\/|https?:/, "a link must never be shared");
    assert.match(text, /Dr Anitha/);
  }
});

test("errors reach the patient in their language, never as the API's English", () => {
  const te = STRINGS.te;
  const apiMsg = "This appointment can no longer be confirmed.";
  assert.equal(portalError(new ApiError(409, "SLOT_TAKEN", "x"), te), te.errSlotTaken);
  assert.equal(portalError(new ApiError(400, "NOT_CONFIRMABLE", apiMsg), te), te.errNoLonger);
  assert.equal(portalError(new ApiError(429, "RATE_LIMITED", "x"), te), te.errTooMany);
  assert.equal(portalError(new TypeError("Failed to fetch"), te), te.errNetwork);
  assert.equal(portalError(new ApiError(500, "DATABASE_ERROR", "x"), te), te.errGeneric);
  assert.notEqual(portalError(new ApiError(400, "NOT_CONFIRMABLE", apiMsg), te), apiMsg);
});
