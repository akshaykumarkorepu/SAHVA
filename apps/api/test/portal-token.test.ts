import test from "node:test";
import assert from "node:assert/strict";
import {
  generatePortalToken,
  hashPortalToken,
  looksLikePortalToken,
  tokensMatch,
} from "../src/lib/portalToken.js";

test("a generated token is long, URL-safe and unguessable", () => {
  const { raw } = generatePortalToken();
  // base64url of 32 bytes: no padding, no characters that break a WhatsApp link.
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  assert.ok(raw.length >= 40, `expected >= 40 chars, got ${raw.length}`);
});

test("tokens do not repeat", () => {
  const seen = new Set(Array.from({ length: 200 }, () => generatePortalToken().raw));
  assert.equal(seen.size, 200);
});

test("only the hash is ever stored, and it cannot be reversed to the token", () => {
  const { raw, hash } = generatePortalToken();
  assert.notEqual(raw, hash);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!hash.includes(raw));
});

test("hashing is deterministic, so a link keeps working", () => {
  const { raw, hash } = generatePortalToken();
  assert.equal(hashPortalToken(raw), hash);
  assert.notEqual(hashPortalToken(raw + "x"), hash);
});

test("shape check rejects junk before any database round trip", () => {
  assert.equal(looksLikePortalToken(generatePortalToken().raw), true);
  for (const bad of ["", "short", "../../etc/passwd", "a".repeat(200), "has spaces in it", "semi;colon"]) {
    assert.equal(looksLikePortalToken(bad), false, `${bad} should be rejected`);
  }
});

test("comparison is length-safe", () => {
  const { raw } = generatePortalToken();
  assert.equal(tokensMatch(raw, raw), true);
  assert.equal(tokensMatch(raw, raw.slice(0, -1)), false);
  assert.equal(tokensMatch(raw, raw + "x"), false);
});
