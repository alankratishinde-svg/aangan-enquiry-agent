import { redactMoney } from "./classify/guard";

/**
 * Text from calls (transcripts, evidence, summaries) can contain a price: the agent slipped, or the caller named a budget.
 * No price is shown on any page except the designer-only internal estimate, so every such text goes through here.
 */
export const safeText = (s: string | null | undefined): string => (s ? redactMoney(s).text : "");
