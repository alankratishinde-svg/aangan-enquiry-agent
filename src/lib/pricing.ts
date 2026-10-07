import { getSection } from "./markdown";

const NEVER_SAY_HEADING = "What the agent must never say";

/**
 * The exact deflection text from pricing.md ("The only acceptable response to a
 * pricing question"). Throws if it cannot be found: the agent must not start a
 * call without it.
 */
export function extractDeflection(pricingMd: string): string {
  const m = /only acceptable response to a pricing question\*{0,2}\s*:\s*["“]([^"”]+)["”]/i.exec(pricingMd);
  if (!m || !m[1]?.trim()) {
    throw new Error('pricing.md: could not find "The only acceptable response to a pricing question"');
  }
  return m[1].trim();
}

/**
 * The part of pricing.md that is safe to put in the agent's instructions: only
 * the "what the agent must never say" rules. The rate tables stay out of the
 * agent's context so it cannot leak them. Fails closed if that section is gone
 * or contains a rupee figure.
 */
export function agentSafePricingRules(pricingMd: string): string {
  const section = getSection(pricingMd, NEVER_SAY_HEADING);
  if (!section) throw new Error(`pricing.md: section "${NEVER_SAY_HEADING}" not found`);
  if (/₹|\brs\.?\s*\d/i.test(section)) {
    throw new Error(`pricing.md: section "${NEVER_SAY_HEADING}" contains a price figure, refusing to load it into the agent`);
  }
  return section;
}
