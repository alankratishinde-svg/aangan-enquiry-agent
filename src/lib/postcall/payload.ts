import { z } from "zod";
import { parseTranscript, type Turn } from "./transcript";

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadError";
  }
}

export interface CallRecord {
  callId: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  endReason: string | null;
  summary: string | null;
  entities: Record<string, unknown>;
  dispositions: Record<string, unknown>;
  recordingUrl: string | null;
  transcript: string;
  turns: Turn[];
  /** Caller's number if Vaani sent one. The docs do not promise it for inbound calls. */
  callerNumber: string | null;
}

export type ParsedEvent =
  | { kind: "postprocessing"; record: CallRecord }
  | { kind: "ignored"; event: string; callId: string | null };

// Shape from docs.vaanivoice.ai/guides/webhook-setup (call_postprocessing). Lenient on extras.
const Postprocessing = z.object({
  event: z.literal("call_postprocessing"),
  call_id: z.string().optional(),
  timestamp: z.string().optional(),
  data: z.object({
    room_name: z.string().optional(),
    call_id: z.string().optional(),
    /** Milliseconds in this event (seconds in call_ended). */
    call_duration: z.number().nonnegative().optional(),
    end_reason: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    entities: z.record(z.string(), z.unknown()).nullable().optional(),
    dispositions: z.record(z.string(), z.unknown()).nullable().optional(),
    recording_url: z.string().nullable().optional(),
    transcript: z.string().default(""),
    phone_number: z.string().nullable().optional(),
    contact_number: z.string().nullable().optional(),
    caller_number: z.string().nullable().optional(),
  }).passthrough(),
}).passthrough();

export function parseVaaniEvent(body: unknown): ParsedEvent {
  const event = typeof body === "object" && body && "event" in body ? String((body as { event: unknown }).event) : "";
  if (event !== "call_postprocessing") {
    const id = typeof body === "object" && body && "room_name" in body ? String((body as { room_name: unknown }).room_name) : null;
    return { kind: "ignored", event: event || "unknown", callId: id };
  }
  const parsed = Postprocessing.safeParse(body);
  if (!parsed.success) throw new PayloadError(`call_postprocessing payload is malformed: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  const p = parsed.data;
  const callId = p.data.call_id ?? p.call_id ?? p.data.room_name;
  if (!callId) throw new PayloadError("call_postprocessing payload has no call id");
  const endedAt = p.timestamp ? new Date(p.timestamp) : new Date();
  if (Number.isNaN(endedAt.getTime())) throw new PayloadError("call_postprocessing timestamp is not a date");
  const durationMs = p.data.call_duration ?? 0;
  const entities = (p.data.entities ?? {}) as Record<string, unknown>;
  const pick = (...vals: unknown[]) => vals.find((v): v is string => typeof v === "string" && v.trim() !== "") ?? null;
  return {
    kind: "postprocessing",
    record: {
      callId,
      startedAt: new Date(endedAt.getTime() - durationMs),
      endedAt,
      durationSeconds: Math.round(durationMs / 1000),
      endReason: p.data.end_reason ?? null,
      summary: p.data.summary ?? null,
      entities,
      dispositions: (p.data.dispositions ?? {}) as Record<string, unknown>,
      recordingUrl: p.data.recording_url ?? null,
      transcript: p.data.transcript,
      turns: parseTranscript(p.data.transcript),
      callerNumber: pick(p.data.phone_number, p.data.contact_number, p.data.caller_number, entities.phone_number, entities.phone, entities.mobile),
    },
  };
}
