import test from "node:test";
import assert from "node:assert/strict";
import { inWords, rupeesInWords } from "../lib/numberWords";

test("amounts in words use lakh and crore", () => {
  assert.equal(inWords(1999), "One Thousand Nine Hundred Ninety Nine");
  assert.equal(inWords(9999), "Nine Thousand Nine Hundred Ninety Nine");
  assert.equal(inWords(1234567), "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven");
  assert.equal(inWords(250000000), "Twenty Five Crore");
  assert.equal(inWords(100), "One Hundred");
});

test("invoice totals read as rupees and paise", () => {
  assert.equal(rupeesInWords(199900), "Rupees One Thousand Nine Hundred Ninety Nine Only");
  assert.equal(rupeesInWords(169407), "Rupees One Thousand Six Hundred Ninety Four and Seven Paise Only");
});
