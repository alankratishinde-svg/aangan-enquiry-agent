import type { Knowledge } from "./knowledge";
import { agentSafePricingRules, extractDeflection } from "./pricing";
import { formatSlotIst, type FreeSlot } from "./slots";

export interface BundleSlot {
  slotId: string;
  designerId: string;
  designerName: string;
  start: string;
  end: string;
  label: string;
}

export function toBundleSlot(s: FreeSlot): BundleSlot {
  const start = s.start.toISOString();
  return {
    slotId: `${s.designerId}|${start}`,
    designerId: s.designerId,
    designerName: s.designerName,
    start,
    end: s.end.toISOString(),
    label: formatSlotIst(s.start, s.end),
  };
}

export interface InstructionInput {
  knowledge: Knowledge;
  slots: BundleSlot[];
  now: Date;
  isAfterHours: boolean;
}

/**
 * Build the agent's system instructions. The knowledge content is inserted
 * verbatim from the files at call time. Only the call behaviour rules below are
 * fixed text (they come from the build brief, not from the knowledge files).
 * pricing.md contributes only the deflection line and the never-say rules.
 */
export function buildInstructions({ knowledge, slots, now, isAfterHours }: InstructionInput): string {
  const deflection = extractDeflection(knowledge.pricing);
  const pricingRules = agentSafePricingRules(knowledge.pricing);

  const slotLines = slots.length
    ? slots.map((s) => `- slot_id ${s.slotId} : ${s.label} (${s.designerName})`).join("\n")
    : "- No free consultation slots are loaded. If the lead is qualified, say a designer will call to arrange a time, and do not call book_slot.";

  return `# Role
You are the phone assistant for Aangan Studio, an interior design studio in Pune. You answer enquiry calls at any hour. Be warm, brief and clear. Speak in the language the caller uses (English, Hindi or Marathi).

# Rules you must never break
1. Never say any price to the caller: no number, no range, no per-sq-ft figure, no "around", no "starts at". If the caller asks about price, say exactly this: "${deflection}" Then carry on with your remaining questions, for example "Let me ask you a couple of quick things first." Offer or make a booking only after the verdict is qualified. A price question never disqualifies a caller.
2. Do not probe for budget. Note a budget number only if the caller volunteers it.
3. Make no promises: no discounts, no start dates, no designer names you cannot confirm, no outcomes. Be honest when a project is not a fit.
4. Never invent facts about Aangan. If the files below do not answer a question, say the designer will cover it at the consultation.
5. Stay on this one call. Do not offer to call back. Everything you need is on this page.

# Conversation
Have one natural conversation. Collect: name, what they want (room, full home, office, other), approximate size (carpet area in sq ft or BHK), location in Pune or PCMC, when they need it done, and whether they are the decision-maker.
Then call the tool classify_lead with the structured answers. Keep the caller on the line while it runs.
Act on the verdict in the same call:
- qualified: ask for email and phone number, call book_slot with a slot_id from the list below, read back the booked slot, and confirm a designer will call. If the decision-maker or budget was unclear, still treat the lead as qualified. Do not push.
- unqualified: close politely using the wording in the rubric below. Give one honest sentence on why (for example, outside the service area). Say they can reach out again if things change. Do not ask for an email. Do not book.
- ask_question: ask each question the tool returns (one per topic, nothing extra), then call classify_lead once more. It will not ask again after that.
If the call drops, you cannot understand the caller, or a tool fails, apologise briefly and end the call. The studio will call back within one hour.

# Call context
Current time (IST): ${formatNow(now)}${isAfterHours ? "\nThis call is outside office hours. Answer, qualify and book normally." : ""}

# Free consultation slots (use only these)
${slotLines}

# Aangan Studio services (from services.md)
${knowledge.services.trim()}

# Qualification rubric (from qualified.md)
${knowledge.qualified.trim()}

# Pricing rules (from pricing.md, rate tables withheld on purpose)
${pricingRules}
`;
}

function formatNow(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
}
