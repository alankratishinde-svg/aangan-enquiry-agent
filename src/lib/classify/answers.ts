import { z } from "zod";

/**
 * What the voice agent sends to classify_lead. The agent fills these from the
 * conversation. Every field is optional because callers do not always say everything.
 */
export const AnswersSchema = z.object({
  name: z.string().optional(),
  project_type: z
    .enum(["single_room", "partial_home", "full_home", "office", "clinic", "studio", "other", "unknown"])
    .default("unknown"),
  /** The caller's own words about what they want. */
  project_description: z.string().default(""),
  wants_design_and_execution: z.enum(["yes", "no", "unclear"]).default("unclear"),
  area_sq_ft: z.number().positive().optional(),
  bhk: z.number().positive().optional(),
  location_text: z.string().optional(),
  needed_by_text: z.string().optional(),
  /** Agent's reading of how many weeks from today the project must be ready. */
  weeks_until_needed: z.number().nonnegative().optional(),
  /** Answer to the timeline follow-up: is the finish date fixed? */
  timeline_firm: z.boolean().optional(),
  decision_maker: z.enum(["self", "authorised_on_behalf", "researching_for_others", "unclear"]).default("unclear"),
  /** Only if the caller volunteered it. Never ask. Kept here for the designer, never repeated in classifier output. */
  budget_volunteered_inr: z.number().positive().optional(),
  budget_text: z.string().optional(),
  asked_about_price: z.boolean().optional(),
  called_after_hours: z.boolean().optional(),
  is_rented: z.boolean().optional(),
  structural_changes: z.boolean().optional(),
  notes: z.string().optional(),
});
export type Answers = z.infer<typeof AnswersSchema>;

export const COMMERCIAL_TYPES: readonly Answers["project_type"][] = ["office", "clinic", "studio"];
