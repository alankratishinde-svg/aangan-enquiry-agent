/**
 * Internal estimate for designers, parsed from pricing.md at runtime. Never hardcode rupee values.
 * It is shown only with the label below. It is never spoken and never sent to the caller.
 */
export const ESTIMATE_LABEL = "Internal, indicative only, not for the client";
export const ESTIMATE_FALLBACK = "See pricing.md";

export interface Rate {
  low: number;
  high: number | null;
}
export interface PricingTable {
  standard: Rate;
  premium: Rate;
  luxury: Rate;
  basic: Rate;
  mid: Rate;
  premiumOffice: Rate;
  singleRoom: { low: number; high: number };
}

const num = (s: string) => Number(s.replace(/,/g, ""));
const rupee = String.raw`₹\s*([\d,]+(?:\.\d+)?)`;

function rate(md: string, label: string): Rate | null {
  const m = new RegExp(String.raw`\|\s*${label}[^|]*\|\s*${rupee}\s*(?:[–-]\s*${rupee}|\+)?\s*per sq ft`, "i").exec(md);
  if (!m) return null;
  return { low: num(m[1]!), high: m[2] ? num(m[2]) : null };
}

export function parsePricing(md: string): PricingTable | null {
  const standard = rate(md, "Standard");
  const premium = rate(md, "Premium specification");
  const luxury = rate(md, "Luxury");
  const basic = rate(md, "Basic fitout");
  const mid = rate(md, "Mid-range");
  const premiumOffice = rate(md, "Premium office");
  const room = new RegExp(String.raw`Single room[^:\n]*:\s*${rupee}\s*lakh\s*[–-]\s*${rupee}\s*lakh`, "i").exec(md);
  if (!standard || !premium || !luxury || !basic || !mid || !premiumOffice || !room) return null;
  return { standard, premium, luxury, basic, mid, premiumOffice, singleRoom: { low: num(room[1]!) * 100_000, high: num(room[2]!) * 100_000 } };
}

export function formatInr(v: number): string {
  if (v >= 10_000_000) return `Rs ${(v / 10_000_000).toFixed(2).replace(/\.?0+$/, "")} crore`;
  return `Rs ${(v / 100_000).toFixed(1).replace(/\.0$/, "")} lakh`;
}

export interface Estimate {
  label: string;
  /** One line for the card, email and HubSpot. */
  text: string;
  low: number | null;
  high: number | null;
  basis: string;
}

export function computeEstimate(
  pricingMd: string,
  lead: { projectType: string | null; areaSqFt: number | null },
): Estimate {
  const fallback: Estimate = { label: ESTIMATE_LABEL, text: ESTIMATE_FALLBACK, low: null, high: null, basis: "pricing.md could not be used" };
  let table: PricingTable | null;
  try {
    table = parsePricing(pricingMd);
  } catch {
    table = null;
  }
  if (!table) return fallback;
  const area = lead.areaSqFt;
  let low: number | null = null;
  let high: number | null = null;
  let basis = "";
  if (lead.projectType === "single_room") {
    low = table.singleRoom.low;
    high = table.singleRoom.high;
    basis = "single room redesign range";
  } else if ((lead.projectType === "full_home" || lead.projectType === "partial_home") && area) {
    low = area * table.standard.low;
    high = area * (table.premium.high ?? table.premium.low);
    basis = `${area} sq ft, standard to premium specification`;
  } else if ((lead.projectType === "office" || lead.projectType === "clinic" || lead.projectType === "studio") && area) {
    low = area * table.basic.low;
    high = area * (table.mid.high ?? table.mid.low);
    basis = `${area} sq ft, basic fitout to mid-range`;
  }
  if (low === null || high === null) return { ...fallback, basis: "size or project type not known" };
  return { label: ESTIMATE_LABEL, text: `${formatInr(low)} to ${formatInr(high)} (${basis}). ${ESTIMATE_LABEL}.`, low, high, basis };
}
