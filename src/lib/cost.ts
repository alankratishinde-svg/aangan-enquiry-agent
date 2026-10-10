/**
 * Cost and indicative value, from configuration only (environment variables). These are the studio's own economics,
 * labelled "Indicative". They are not prices quoted to any client, and nothing here is guessed in code.
 */
export interface CostConfig {
  /** What one handled call costs the studio (Vaani minutes, Gemini, Vercel), in rupees. */
  costPerCallInr: number | null;
  /** Typical project value range, in rupees. */
  projectValueLowInr: number | null;
  projectValueHighInr: number | null;
  /** Share of qualified leads that become projects, percent. */
  conversionPct: number | null;
  hubspotPortalId: string | null;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function loadCostConfig(env: Record<string, string | undefined> = process.env): CostConfig {
  return {
    costPerCallInr: num(env.COST_PER_CALL_INR),
    projectValueLowInr: num(env.INDICATIVE_PROJECT_VALUE_LOW_INR),
    projectValueHighInr: num(env.INDICATIVE_PROJECT_VALUE_HIGH_INR),
    conversionPct: num(env.INDICATIVE_CONVERSION_PCT),
    hubspotPortalId: env.HUBSPOT_PORTAL_ID?.trim() || null,
  };
}

export interface CostSummary {
  totalCostInr: number | null;
  costPerQualifiedLeadInr: number | null;
  /** Indicative value of one qualified lead: midpoint of the project value range times the conversion share. */
  valuePerQualifiedLeadInr: number | null;
  totalIndicativeValueInr: number | null;
  missing: string[];
}

export function summariseCost(cfg: CostConfig, counts: { calls: number; qualified: number }): CostSummary {
  const missing: string[] = [];
  if (cfg.costPerCallInr === null) missing.push("COST_PER_CALL_INR");
  if (cfg.projectValueLowInr === null) missing.push("INDICATIVE_PROJECT_VALUE_LOW_INR");
  if (cfg.projectValueHighInr === null) missing.push("INDICATIVE_PROJECT_VALUE_HIGH_INR");
  if (cfg.conversionPct === null) missing.push("INDICATIVE_CONVERSION_PCT");
  const totalCost = cfg.costPerCallInr === null ? null : cfg.costPerCallInr * counts.calls;
  const mid = cfg.projectValueLowInr !== null && cfg.projectValueHighInr !== null ? (cfg.projectValueLowInr + cfg.projectValueHighInr) / 2 : null;
  const perLead = mid !== null && cfg.conversionPct !== null ? mid * (cfg.conversionPct / 100) : null;
  return {
    totalCostInr: totalCost,
    costPerQualifiedLeadInr: totalCost !== null && counts.qualified > 0 ? totalCost / counts.qualified : null,
    valuePerQualifiedLeadInr: perLead,
    totalIndicativeValueInr: perLead === null ? null : perLead * counts.qualified,
    missing,
  };
}
