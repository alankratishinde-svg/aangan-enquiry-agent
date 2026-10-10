import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { GeminiClient } from "../gemini";
import { AnswersSchema } from "../classify/answers";
import { formatTurnsForPrompt, type Turn } from "./transcript";

export const EXTRACT_PROMPT_VERSION = "extract_call.v1";

export class ExtractError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExtractError";
  }
}

const Nullable = z.string().nullable().optional();

export const ExtractionSchema = z.object({
  answers: AnswersSchema,
  contact: z.object({ name: Nullable, email: Nullable, phone: Nullable }).default({}),
  /** What the caller asked for, as short checklist items. Becomes the designer's progress checklist. */
  requested_items: z.array(z.string()).default([]),
  agent: z.object({
    stated_price: z.boolean().default(false),
    price_evidence: z.array(z.object({ turn: z.number().optional(), quote: z.string() })).default([]),
    booking_started_turn: z.number().int().nullable().default(null),
    booking_confirmed: z.boolean().default(false),
    qualifying_complete_turn: z.number().int().nullable().default(null),
    asked_for_email: z.boolean().default(false),
    gave_decline_close: z.boolean().default(false),
    caller_not_understood: z.boolean().default(false),
  }),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** Gemini reads the transcript and returns the structured answers plus what the agent did. */
export async function extractFromTranscript(
  turns: Turn[],
  deps: { gemini: GeminiClient; callDate: Date; promptsDir?: string },
): Promise<Extraction> {
  const raw = await readFile(join(deps.promptsDir ?? join(process.cwd(), "prompts"), `${EXTRACT_PROMPT_VERSION}.md`), "utf8");
  const sys = raw.indexOf("=====SYSTEM=====");
  const usr = raw.indexOf("=====USER=====");
  if (sys === -1 || usr === -1) throw new ExtractError("extract prompt is missing its section markers");
  const system = raw.slice(sys + 16, usr).trim();
  const user = raw
    .slice(usr + 14)
    .trim()
    .replace("{{CALL_DATE}}", () => new Date(deps.callDate.getTime() + 330 * 60_000).toISOString().slice(0, 10))
    .replace("{{TRANSCRIPT}}", () => formatTurnsForPrompt(turns));

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await deps.gemini.generate({
        system,
        user: user + (attempt ? "\n\nYour previous reply was not valid JSON for the schema. Return only the JSON object." : ""),
        json: true,
      });
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      return ExtractionSchema.parse(JSON.parse(cleaned));
    } catch (err) {
      lastErr = err;
    }
  }
  throw new ExtractError(`Gemini extraction failed: ${(lastErr as Error).message}`, { cause: lastErr });
}
