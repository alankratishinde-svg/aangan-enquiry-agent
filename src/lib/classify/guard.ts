/**
 * No output of the classifier may contain a price. Spoken fields get a safe
 * fallback when a price slips in. Internal text (evidence, notes) gets money
 * figures redacted; the caller's own budget figure stays in `answers`, never here.
 */
const PRICE_PATTERNS: RegExp[] = [
  /₹/,
  /\brs\.?\s*\d/i,
  /\binr\b/i,
  /\brupees?\b/i,
  /\b(lakh|lakhs|lac|lacs|crore|crores)\b/i,
  /\bper\s*(sq\.?\s*ft|square\s*f)/i,
  /\b\d+(\.\d+)?\s*k\b/i,
  /\b(costs?|priced?|rates?)\s+(around|about|approximately|from|starts?|starting)\b/i,
  /\bstarts?\s+at\b/i,
  /\bstarting\s+(at|from)\b/i,
];

export function containsPrice(text: string): boolean {
  return PRICE_PATTERNS.some((p) => p.test(text));
}

const MONEY_TOKEN =
  /(₹|\brs\.?)\s*[\d,.]+(\s*(lakhs?|lacs?|crores?|k)\b)?|[\d,.]+\s*(lakhs?|lacs?|crores?)\b|\b\d+(\.\d+)?\s*k\b/gi;

/** Redact money figures from internal text. If a price still shows, withhold the whole string. */
export function redactMoney(text: string): { text: string; changed: boolean } {
  const redacted = text.replace(MONEY_TOKEN, "[budget figure]");
  if (containsPrice(redacted)) return { text: "[text withheld: it contained a price]", changed: true };
  return { text: redacted, changed: redacted !== text };
}

/** For anything the agent may say aloud: replace with the fallback if it contains a price. */
export function guardSpoken(text: string | null, fallback: string, hits: string[], label: string): string | null {
  if (text === null) return null;
  if (containsPrice(text)) {
    hits.push(label);
    return fallback;
  }
  return text;
}
