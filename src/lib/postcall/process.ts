import type { Config } from "../config";
import { classifyLead, InMemoryClassifyStore } from "../classify/classify";
import type { ClassificationResult } from "../classify/types";
import type { GeminiClient } from "../gemini";
import { loadKnowledge, type Knowledge } from "../knowledge";
import { isAfterHours } from "../slots";
import { clientSizeLabel } from "./client-size";
import { detectSpokenPrice, userTurnCount } from "./compliance";
import { extractFromTranscript, EXTRACT_PROMPT_VERSION, type Extraction } from "./extract";
import type { PostCallStore, SavePlan } from "./store";
import type { HubspotClient } from "./hubspot";
import { PROMPT_VERSION } from "../classify/rules";
import type { CallRecord } from "./payload";
import type { CalcomClient } from "../calcom";
import type { EmailSender } from "../email";
import { finalizeQualifiedLead, type FinalizeResult } from "../leads/finalize";

export interface ProcessDeps {
  store: PostCallStore;
  gemini: GeminiClient;
  config: Config;
  /** Null when HubSpot is not configured: qualified leads are saved and flagged, no deal is made. */
  hubspot: HubspotClient | null;
  knowledge?: Knowledge;
  now?: () => Date;
  promptsDir?: string;
  calcom?: CalcomClient | null;
  email?: EmailSender | null;
  dashboardBaseUrl?: string;
}

export interface ProcessResult {
  status: "qualified" | "unqualified" | "failed";
  duplicate: boolean;
  callId: string | null;
  leadId: string | null;
  priceSpoken: boolean;
  bookingBeforeQualified: boolean;
  hubspot: "created" | "skipped" | "failed" | "not_configured";
  /** Present for qualified calls. */
  finalize?: FinalizeResult;
  reasons: string[];
}

/**
 * Everything after a call ends: read the transcript, classify it with the same rule
 * engine as before, run the compliance checks (price said, booking before qualified),
 * write call, lead and review entry to Neon in one transaction, then create the HubSpot
 * deal for qualified calls only. Safe to run twice on the same call (the second run is a no-op
 * except for retrying a HubSpot deal that failed the first time).
 */
export async function processCall(record: CallRecord, deps: ProcessDeps): Promise<ProcessResult> {
  const { store, config } = deps;
  const now = (deps.now ?? (() => new Date()))();

  const existing = await store.findCall(record.callId);
  if (existing) {
    const fin = existing.status === "qualified" && existing.leadId ? await finalizeFor(existing.leadId, deps) : undefined;
    return { status: existing.status as ProcessResult["status"], duplicate: true, callId: existing.callId, leadId: existing.leadId, priceSpoken: false, bookingBeforeQualified: false, hubspot: fin?.hubspot ?? "skipped", finalize: fin, reasons: [] };
  }

  const price = detectSpokenPrice(record.turns);
  const callbackDueAt = new Date(record.endedAt.getTime() + config.callbackTargetMinutes * 60_000);
  const base = {
    vaaniCallId: record.callId,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    callerNumber: record.callerNumber,
    transcript: record.transcript,
    isAfterHours: isAfterHours(record.startedAt, config),
    summary: record.summary,
    entities: record.entities,
    recordingUrl: record.recordingUrl,
    responseSeconds: record.turns.some((t) => t.role === "agent") ? 0 : null,
  };

  // A call with no caller speech cannot be classified. Callback list, one hour target.
  const failPlan = (reason: string, extra: { extraction?: Extraction } = {}): SavePlan => {
    const flagReasons = price.found ? [{ type: "price_spoken", evidence: price.hits }] : [];
    return {
      call: {
        ...base, status: "failed", answers: extra.extraction?.answers ?? {}, verdict: null, failureReason: reason, callbackDueAt,
        priceSpoken: price.found, bookingBeforeQualified: false,
        flags: { price_evidence: price.hits, prompt_versions: { extract: EXTRACT_PROMPT_VERSION } },
      },
      lead: price.found ? { name: null, phone: record.callerNumber, email: null, projectType: null, areaSqFt: null, location: null, neededBy: null, summary: record.summary, clientSize: null, handoffNotes: [] } : null,
      review: price.found ? { kind: "compliance", reasons: flagReasons } : null,
    };
  };
  const finish = async (plan: SavePlan, reasons: string[]): Promise<ProcessResult> => {
    const saved = await store.saveCall(plan);
    const fin = !saved.duplicate && plan.call.status === "qualified" && saved.leadId ? await finalizeFor(saved.leadId, deps) : undefined;
    return {
      status: plan.call.status, duplicate: saved.duplicate, callId: saved.callId, leadId: saved.leadId,
      priceSpoken: plan.call.priceSpoken, bookingBeforeQualified: plan.call.bookingBeforeQualified,
      hubspot: fin?.hubspot ?? "skipped", finalize: fin, reasons,
    };
  };

  if (userTurnCount(record.turns) === 0) {
    return finish(failPlan("No caller speech in the transcript"), ["no_caller_speech"]);
  }

  let extraction: Extraction;
  try {
    extraction = await extractFromTranscript(record.turns, { gemini: deps.gemini, callDate: record.startedAt, promptsDir: deps.promptsDir });
  } catch (err) {
    return finish(failPlan(`Post-call analysis failed, needs a person to review: ${(err as Error).message.slice(0, 200)}`), ["analysis_failed"]);
  }
  if (extraction.agent.caller_not_understood && userTurnCount(record.turns) <= 2) {
    return finish(failPlan("The agent could not understand the caller", { extraction }), ["caller_not_understood"]);
  }

  // Classification: same rule engine, final round (no questions are possible after the call).
  const knowledge = deps.knowledge ?? (await loadKnowledge(config.knowledgeDir));
  const answers = { ...extraction.answers };
  // Nobody can ask a question after the call. If the agent already took the caller forward (asked for an
  // email or booked), details the transcript leaves unclear do not cancel the lead: it goes to a designer with
  // a note. If the agent did not take the caller forward, the configured policy applies.
  const agentTookForward = extraction.agent.booking_confirmed || extraction.agent.booking_started_turn !== null || extraction.agent.asked_for_email;
  const auditConfig: Config = agentTookForward && !extraction.agent.gave_decline_close ? { ...config, unclearAfterRetry: "qualified" } : config;
  let result: ClassificationResult;
  try {
    result = await classifyLead(record.callId, answers, {
      gemini: deps.gemini, config: auditConfig, knowledge, store: new InMemoryClassifyStore(), now: deps.now, promptsDir: deps.promptsDir, finalRound: true,
    });
  } catch (err) {
    return finish(failPlan(`Post-call classification failed, needs a person to review: ${(err as Error).message.slice(0, 200)}`, { extraction }), ["classification_failed"]);
  }
  const status: "qualified" | "unqualified" = result.verdict === "qualified" ? "qualified" : "unqualified";

  // Compliance flags.
  const a = extraction.agent;
  const priceSpoken = price.found || a.stated_price;
  const lastAgentTurn = [...record.turns].reverse().find((t) => t.role === "agent")?.index ?? null;
  const bookingTurn = a.booking_started_turn ?? (a.booking_confirmed ? lastAgentTurn : null);
  const q = a.qualifying_complete_turn;
  const bookedBeforeInfo = bookingTurn !== null && (q === null || bookingTurn <= q);
  const bookedWhileNotQualified = bookingTurn !== null && status !== "qualified";
  const bookingFlag = bookedBeforeInfo || bookedWhileNotQualified;
  const declinedButQualified = a.gave_decline_close && status === "qualified";

  const reasons: string[] = [];
  const reviewReasons: unknown[] = [];
  if (status === "unqualified") {
    reasons.push("unqualified");
    reviewReasons.push({
      type: "unqualified",
      decline_reason: result.decline_reason,
      criteria: Object.entries(result.criteria)
        .filter(([, v]) => v.status === "fail" || v.status === "unclear")
        .map(([k, v]) => ({ criterion: k, status: v.status, evidence: v.evidence })),
    });
  }
  if (priceSpoken) {
    reasons.push("price_spoken");
    reviewReasons.push({ type: "price_spoken", regex_hits: price.hits, gemini_evidence: a.price_evidence });
  }
  if (bookingFlag) {
    reasons.push("booking_before_qualified");
    reviewReasons.push({
      type: "booking_before_qualified",
      booking_started_turn: bookingTurn, qualifying_complete_turn: q,
      booked_before_info_complete: bookedBeforeInfo, booked_while_not_qualified: bookedWhileNotQualified,
    });
  }
  if (declinedButQualified) {
    reasons.push("declined_but_qualified");
    reviewReasons.push({ type: "declined_but_qualified", detail: "The agent told the caller it is not a fit, but the transcript qualifies. A person should call this lead back." });
  }

  const weeks = answers.weeks_until_needed;
  const neededBy = weeks !== undefined ? new Date(record.startedAt.getTime() + weeks * 7 * 86_400_000).toISOString().slice(0, 10) : null;
  const notes = [...result.handoff_notes];
  if (declinedButQualified) notes.push("The agent told the caller this was not a fit. Call back first.");
  const lead = {
    name: extraction.contact.name ?? answers.name ?? null,
    phone: extraction.contact.phone ?? record.callerNumber,
    // Unqualified callers are never asked for an email. Store none.
    email: status === "qualified" ? (extraction.contact.email ?? null) : null,
    projectType: answers.project_type === "unknown" ? null : answers.project_type,
    areaSqFt: answers.area_sq_ft ? Math.round(answers.area_sq_ft) : null,
    location: answers.location_text ?? null,
    neededBy,
    summary: record.summary,
    clientSize: clientSizeLabel(answers.project_type, answers.area_sq_ft, config),
    handoffNotes: notes,
    requirements: status === "qualified" ? extraction.requested_items.slice(0, 8) : [],
  };

  const plan: SavePlan = {
    call: {
      ...base, status, answers: { ...answers, contact: extraction.contact }, verdict: result, failureReason: null, callbackDueAt: null,
      priceSpoken, bookingBeforeQualified: bookingFlag,
      flags: {
        price_evidence: { regex: price.hits, gemini: a.price_evidence },
        booking: { started_turn: bookingTurn, confirmed: a.booking_confirmed, qualifying_complete_turn: q, before_info_complete: bookedBeforeInfo, while_not_qualified: bookedWhileNotQualified },
        agent: { asked_for_email: a.asked_for_email, gave_decline_close: a.gave_decline_close },
        declined_but_qualified: declinedButQualified,
        prompt_versions: { classify: PROMPT_VERSION, extract: EXTRACT_PROMPT_VERSION },
      },
    },
    lead,
    review: reviewReasons.length ? { kind: status === "unqualified" ? "unqualified" : "compliance", reasons: reviewReasons } : null,
  };
  return finish(plan, reasons);
}

async function finalizeFor(leadId: string, deps: ProcessDeps): Promise<FinalizeResult> {
  const knowledge = deps.knowledge ?? (await loadKnowledge(deps.config.knowledgeDir));
  return finalizeQualifiedLead(leadId, {
    store: deps.store, config: deps.config, gemini: deps.gemini, knowledge, calcom: deps.calcom ?? null,
    email: deps.email ?? null, hubspot: deps.hubspot, dashboardBaseUrl: deps.dashboardBaseUrl, promptsDir: deps.promptsDir,
  });
}

/** Entry point for the route: store the raw body, process it, mark the result. */
export async function handleVaaniEvent(
  body: unknown,
  deps: ProcessDeps,
  parse: (b: unknown) => import("./payload").ParsedEvent,
): Promise<{ eventId: string; result: ProcessResult | { ignored: string } }> {
  let parsed: import("./payload").ParsedEvent;
  try {
    parsed = parse(body);
  } catch (err) {
    // Keep the raw body even when it cannot be read, so a person can look at it.
    const id = await deps.store.recordEvent("malformed", null, body);
    await deps.store.markEvent(id, "failed", String((err as Error).message).slice(0, 500));
    throw err;
  }
  const callId = parsed.kind === "postprocessing" ? parsed.record.callId : parsed.callId;
  const eventId = await deps.store.recordEvent(parsed.kind === "postprocessing" ? "call_postprocessing" : parsed.event, callId, body);
  if (parsed.kind === "ignored") {
    await deps.store.markEvent(eventId, "ignored");
    return { eventId, result: { ignored: parsed.event } };
  }
  try {
    const result = await processCall(parsed.record, deps);
    await deps.store.markEvent(eventId, "processed");
    return { eventId, result };
  } catch (err) {
    await deps.store.markEvent(eventId, "failed", String((err as Error).message).slice(0, 500));
    throw err;
  }
}
