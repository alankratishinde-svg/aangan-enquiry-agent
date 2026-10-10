import { containsPrice } from "../classify/guard";
import type { Turn } from "./transcript";

/** Spoken forms a transcript can contain that the written-price patterns miss. */
const SPOKEN_UNITS = /\b(thousand|hazaa?r)\b/i;
const MONEY_CONTEXT = /(rupee|rupaye|rupay|\brs\b|₹|cost|price|charge|rate|budget|pay|kharcha|kimat|qeemat|daam|paisa)/i;
const PER_AREA = /\bper\s+(square\s+)?(foot|feet|sq)/i;
const RATE_PHRASE = /\b(ballpark|rough(ly)?|typically|usually|generally)\b[\s\S]{0,60}\b(cost|price|charge|rate)/i;

export interface PriceHit {
  turn: number;
  text: string;
}

/**
 * Deterministic check: did the AGENT say a price? Looks only at agent turns.
 * Gemini does a second, semantic pass (number words, hints). Either one sets price_spoken.
 */
export function detectSpokenPrice(turns: Turn[]): { found: boolean; hits: PriceHit[] } {
  const hits: PriceHit[] = [];
  for (const t of turns) {
    if (t.role !== "agent") continue;
    const text = t.text;
    const hit =
      containsPrice(text) ||
      PER_AREA.test(text) ||
      RATE_PHRASE.test(text) ||
      (SPOKEN_UNITS.test(text) && MONEY_CONTEXT.test(text));
    if (hit) hits.push({ turn: t.index, text: text.length > 240 ? `${text.slice(0, 237)}...` : text });
  }
  return { found: hits.length > 0, hits };
}

export function userTurnCount(turns: Turn[]): number {
  return turns.filter((t) => t.role === "user" && t.text.trim().length > 0).length;
}
