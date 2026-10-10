import type { Config } from "../config";
import type { CalcomClient } from "../calcom";
import type { EmailSender } from "../email";
import type { GeminiClient } from "../gemini";
import type { Knowledge } from "../knowledge";
import { formatSlotIst } from "../slots";
import type { HubspotClient } from "../postcall/hubspot";
import { dealName, type PostCallStore } from "../postcall/store";
import { pickDesigner } from "./assign";
import { buildDesignerEmail } from "./designer-email";
import { computeEstimate } from "./estimate";
import { writeSummaryAndTips } from "./summary";

export interface FinalizeDeps {
  store: PostCallStore;
  config: Config;
  gemini: GeminiClient;
  knowledge: Knowledge;
  calcom?: CalcomClient | null;
  email?: EmailSender | null;
  hubspot?: HubspotClient | null;
  /** Public base URL of the dashboard, for the link in the designer email. */
  dashboardBaseUrl?: string;
  promptsDir?: string;
}

export interface FinalizeResult {
  booking: "found" | "none" | "not_configured" | "failed" | "kept";
  designerId: string | null;
  estimate: string;
  tips: boolean;
  hubspot: "created" | "skipped" | "failed" | "not_configured";
  email: "sent" | "skipped" | "not_configured" | "failed" | "no_designer";
}

/**
 * Everything a qualified lead needs after it is saved: its Cal.com booking, a designer, the internal estimate,
 * a summary with 2 add-on tips, the HubSpot deal, and the designer email. Every step is safe to run again and
 * records its own error on the call instead of failing the others.
 */
export async function finalizeQualifiedLead(leadId: string, deps: FinalizeDeps): Promise<FinalizeResult> {
  const { store } = deps;
  const out: FinalizeResult = { booking: "kept", designerId: null, estimate: "", tips: false, hubspot: "skipped", email: "skipped" };
  let lead = await store.loadLeadForFinalize(leadId);
  if (!lead) return out;
  const flag = (patch: Record<string, unknown>) => store.addCallFlags(lead!.callId, patch).catch(() => undefined);

  // 1. The booking Vaani's Cal.com tool made during the call.
  if (!lead.bookedSlot) {
    if (!deps.calcom) out.booking = "not_configured";
    else if (!lead.email) out.booking = "none";
    else {
      try {
        const b = await deps.calcom.findUpcomingBooking(lead.email);
        if (b) {
          await store.updateLead(leadId, { bookedSlot: new Date(b.start).toISOString(), calcomBookingUid: b.uid });
          out.booking = "found";
        } else {
          out.booking = "none";
          const note = "No Cal.com booking was found for this caller's email. Arrange a consultation time.";
          if (!lead.handoffNotes.includes(note)) await store.updateLead(leadId, { handoffNotes: [...lead.handoffNotes, note] });
        }
      } catch (err) {
        out.booking = "failed";
        await flag({ calcom_error: String((err as Error).message).slice(0, 300) });
      }
    }
  }

  // 2. Designer. Round robin by fewest open leads (placeholder until designers have their own calendars).
  if (!lead.assignedDesignerId && lead.email) {
    try {
      const d = pickDesigner(await store.listActiveDesigners(), await store.designerLoads());
      if (d) await store.updateLead(leadId, { assignedDesignerId: d.id });
    } catch (err) {
      await flag({ assign_error: String((err as Error).message).slice(0, 300) });
    }
  }

  // 3. Internal estimate, parsed from pricing.md. Never spoken, never sent to the caller.
  if (!lead.internalEstimate) {
    const est = computeEstimate(deps.knowledge.pricing, { projectType: lead.projectType, areaSqFt: lead.areaSqFt });
    await store.updateLead(leadId, { internalEstimate: est });
  }

  // 4. Summary and exactly two add-on tips.
  if (lead.addOnTips.length === 0) {
    try {
      const s = await writeSummaryAndTips(
        { servicesMd: deps.knowledge.services, answers: lead.answers, callSummary: lead.callSummary, notes: lead.handoffNotes, promptsDir: deps.promptsDir },
        deps.gemini,
      );
      if (s) await store.updateLead(leadId, { summary: s.summary, addOnTips: s.tips });
    } catch (err) {
      await flag({ summary_error: String((err as Error).message).slice(0, 300) });
    }
  }

  lead = (await store.loadLeadForFinalize(leadId))!;
  out.designerId = lead.assignedDesignerId;
  out.tips = lead.addOnTips.length === 2;
  out.estimate = (lead.internalEstimate as { text?: string } | null)?.text ?? "";

  // 5. HubSpot deal (qualified calls only; this function only runs for them).
  if (lead.hubspotDealId) out.hubspot = "skipped";
  else if (!deps.hubspot) out.hubspot = "not_configured";
  else {
    try {
      const input = await store.loadDealInput(leadId);
      if (input) {
        const { dealId } = await deps.hubspot.createDeal({ ...input, dealName: dealName(input.projectType, input.contactName, input.location) });
        await store.setHubspotDeal(leadId, dealId);
        out.hubspot = "created";
      }
    } catch (err) {
      out.hubspot = "failed";
      await flag({ hubspot_error: String((err as Error).message).slice(0, 300) });
    }
  }

  // 6. Designer email.
  if (lead.emailSentAt) out.email = "skipped";
  else if (!lead.assignedDesignerId) out.email = "no_designer";
  else if (!deps.email) out.email = "not_configured";
  else {
    try {
      const designer = (await store.listActiveDesigners()).find((d) => d.id === lead!.assignedDesignerId);
      if (designer) {
        const base = (deps.dashboardBaseUrl ?? "http://localhost:3000").replace(/\/$/, "");
        await deps.email.send(
          buildDesignerEmail({
            designerName: designer.name, designerEmail: designer.email, name: lead.name, phone: lead.phone, email: lead.email,
            projectType: lead.projectType, areaSqFt: lead.areaSqFt, location: lead.location, neededBy: lead.neededBy,
            clientSize: lead.clientSize, summary: lead.summary, bookedSlotIst: lead.bookedSlot ? formatSlotIst(new Date(lead.bookedSlot), new Date(new Date(lead.bookedSlot).getTime() + deps.config.consultationMinutes * 60_000)) : null,
            handoffNotes: lead.handoffNotes, estimateText: out.estimate || "See pricing.md", dashboardUrl: `${base}/designer?lead=${lead.id}`,
          }),
        );
        await store.updateLead(leadId, { emailSentNow: true });
        out.email = "sent";
      }
    } catch (err) {
      out.email = "failed";
      await flag({ email_error: String((err as Error).message).slice(0, 300) });
    }
  }
  return out;
}
