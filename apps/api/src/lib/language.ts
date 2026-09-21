/**
 * Heuristic Telugu detection.
 *  - If the text contains any Telugu Unicode block character, return "te".
 *  - Otherwise "en".
 *
 * Telugu Unicode range: U+0C00 – U+0C7F
 */
export function detectLanguage(text: string): "en" | "te" {
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if (code >= 0x0c00 && code <= 0x0c7f) return "te";
  }
  return "en";
}
