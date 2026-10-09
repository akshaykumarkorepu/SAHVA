import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Portal links are bearer credentials, so they are handled like passwords:
 * generated with CSPRNG entropy, stored only as a hash, and compared in
 * constant time.
 *
 * 32 bytes base64url ≈ 43 characters — long enough that guessing is hopeless,
 * short enough to survive being pasted into a WhatsApp message.
 */
export function generatePortalToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashPortalToken(raw) };
}

export function hashPortalToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Shape check before touching the database — a malformed token is not a lookup. */
export function looksLikePortalToken(raw: string): boolean {
  return /^[A-Za-z0-9_-]{40,50}$/.test(raw);
}

export function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
