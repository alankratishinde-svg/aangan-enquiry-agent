import { timingSafeEqual } from "node:crypto";
import type { VaaniClient } from "../vaani/client";
import { parseTranscript } from "../postcall/transcript";
import type { CallRecord } from "../postcall/payload";

/** Constant-time token check. Fails closed: no configured token means every request is refused. */
export function tokenOk(given: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || expected.length < 16 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface VaaniEventBody {
  event: string;
  call_id?: unknown;
  timestamp?: unknown;
  data?: unknown;
  [k: string]: unknown;
}

/**
 * Vaani may deliver one event per request, or a batch envelope: { event, events: [ { event, call_id, data, timestamp }, ... ] }
 * (seen in Vaani's own "send test" delivery, 2026-10-10). Both are flattened into a list of single events.
 */
export function extractEvents(body: unknown): VaaniEventBody[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.events)) {
    return b.events
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && !Array.isArray(e))
      .map((e) => ({ ...e, event: typeof e.event === "string" ? e.event : "unknown", timestamp: e.timestamp ?? b.timestamp }));
  }
  return [{ ...b, event: typeof b.event === "string" ? b.event : "unknown" }];
}

export type VerifyOutcome =
  | { ok: true; kind: "call"; callId: string; record: CallRecord }
  | { ok: true; kind: "ignored"; event: string }
  | { ok: false; status: number; reason: string };

/**
 * End-of-call events that carry the finished call. `call_postprocessing` is documented for dashboard webhooks;
 * `call.completed` is the name on the campaign webhooks page. The body is never trusted, so a second name is safe:
 * either way we re-read the call from Vaani.
 */
const FINAL_EVENTS = new Set(["call_postprocessing", "call.completed", "call_completed"]);

function callIdOf(body: Record<string, unknown>): string | null {
  const data = (typeof body.data === "object" && body.data ? body.data : {}) as Record<string, unknown>;
  for (const v of [data.call_id, body.call_id, data.room_name, body.room_name]) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

const FOUR_HOURS = 4 * 3600 * 1000;

/**
 * Vaani documents no signature for call webhooks, so the webhook body is NOT trusted. We take only the
 * call id, ask Vaani for that call with our own API key, and build the record from Vaani's answer.
 * A forged request can at most name a real call, which is then processed once (idempotent), or an
 * unknown id, which is refused. Timing and caller number come from the body but are range-checked.
 */
export async function verifyWithVaani(body: unknown, vaani: VaaniClient, now: Date = new Date()): Promise<VerifyOutcome> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, reason: "Body is not a JSON object" };
  const b = body as Record<string, unknown>;
  const event = typeof b.event === "string" ? b.event : "";
  if (!FINAL_EVENTS.has(event)) return { ok: true, kind: "ignored", event: event || "unknown" };
  const callId = callIdOf(b);
  if (!callId) return { ok: false, status: 400, reason: "No call id in the event" };

  let d;
  try {
    d = await vaani.getCallDetails(callId);
  } catch {
    return { ok: false, status: 503, reason: "Vaani could not be reached to verify the call" };
  }
  if (d.status === "unauthorized") return { ok: false, status: 502, reason: "Our Vaani API key was refused" };
  if (d.status === "not_found") return { ok: false, status: 403, reason: "Not a call under this Vaani account" };
  if (d.status === "pending") return { ok: false, status: 503, reason: "Vaani has not finished processing this call yet" };

  const data = (typeof b.data === "object" && b.data ? b.data : {}) as Record<string, unknown>;
  const asDate = (v: unknown): Date | null => {
    if (typeof v !== "string") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const inRange = (d: Date | null) => d && d.getTime() <= now.getTime() + 5 * 60_000 && d.getTime() >= now.getTime() - 30 * 86_400_000;
  // Vaani sends the real start and end times: use them. Fall back to the event time and the duration.
  // call_duration is seconds in a real delivery (133.51 for a 2 minute call) although the docs say milliseconds
  // for this event, so it is only used when the timestamps are missing: under 1000 means seconds.
  const rawDuration = typeof data.call_duration === "number" ? data.call_duration : 0;
  const durationMs = Math.min(Math.max(rawDuration > 0 && rawDuration < 1000 ? rawDuration * 1000 : rawDuration, 0), FOUR_HOURS);
  const evTs = asDate(b.timestamp);
  const endedAt = inRange(asDate(data.call_ended_at)) ? asDate(data.call_ended_at)! : inRange(evTs) ? evTs! : now;
  const startCandidate = asDate(data.call_started_at) ?? asDate(data.picked_up_at);
  const startedAt = inRange(startCandidate) && startCandidate!.getTime() <= endedAt.getTime() ? startCandidate! : new Date(endedAt.getTime() - durationMs);
  const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  // Web test calls report "web-user". Only something that looks like a phone number is kept.
  const phoneLike = (v: unknown): string | null => (typeof v === "string" && /^\+?[\d\s().-]{7,20}$/.test(v.trim()) ? v.trim() : null);
  const pick = (...vals: unknown[]) => vals.map(phoneLike).find((v): v is string => v !== null) ?? null;
  const record: CallRecord = {
    callId,
    startedAt,
    endedAt,
    durationSeconds,
    endReason: typeof data.end_reason === "string" ? data.end_reason : null,
    summary: d.summary,
    entities: d.entity,
    dispositions: (typeof data.dispositions === "object" && data.dispositions ? data.dispositions : {}) as Record<string, unknown>,
    recordingUrl: typeof data.recording_url === "string" ? data.recording_url : null,
    transcript: d.transcription,
    turns: parseTranscript(d.transcription),
    callerNumber: pick(data.phone_number, data.contact_number, data.caller_number, b.from, d.entity.phone_number, d.entity.phone, d.entity.mobile),
  };
  return { ok: true, kind: "call", callId, record };
}
