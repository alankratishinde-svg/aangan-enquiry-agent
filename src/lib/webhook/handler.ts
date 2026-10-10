import { processCall, type ProcessDeps, type ProcessResult } from "../postcall/process";
import type { PostCallStore } from "../postcall/store";
import type { VaaniClient } from "../vaani/client";
import { extractEvents, tokenOk, verifyWithVaani } from "./verify";

export interface WebhookInput {
  token: string | null;
  body: unknown;
  /** Replaying a stored event: reuse its row instead of storing the body again. */
  eventId?: string;
}
export interface WebhookDeps {
  store: PostCallStore;
  vaani: VaaniClient;
  expectedToken: string | undefined;
  now?: () => Date;
}
export interface Accepted {
  status: 200 | 401 | 400 | 403 | 502 | 503;
  json: Record<string, unknown>;
  /** Work to run after the HTTP reply, so Vaani gets its answer in well under 5 seconds. */
  after?: () => Promise<void>;
}

/**
 * The whole webhook, minus the HTTP wrapper:
 *  1. URL token (fail closed)  2. store the raw body  3. verify the call with Vaani  4. reply 200
 *  5. after the reply: classify, save, HubSpot, email.
 */
export async function acceptWebhook(input: WebhookInput, deps: WebhookDeps, process: (record: import("../postcall/payload").CallRecord) => Promise<ProcessResult>): Promise<Accepted> {
  if (!tokenOk(input.token, deps.expectedToken)) return { status: 401, json: { error: "unauthorized" } };

  const events = extractEvents(input.body);
  const top = (input.body && typeof input.body === "object" ? (input.body as Record<string, unknown>) : {}) as Record<string, unknown>;
  const firstCall = events.map((e) => callIdFrom(e)).find(Boolean) ?? null;
  const eventId = input.eventId ?? (await deps.store.recordEvent(typeof top.event === "string" ? top.event : "unknown", firstCall, input.body));

  if (events.length === 0) {
    await deps.store.markEvent(eventId, "failed", "Body is not a Vaani event");
    return { status: 400, json: { error: "Body is not a Vaani event" } };
  }
  // Vaani's own "send test" delivery: acknowledge it so the Vaani screen shows success. Nothing is processed.
  if (top.event === "webhook_test") {
    await deps.store.markEvent(eventId, "ignored");
    return { status: 200, json: { status: "test_received", events: events.length } };
  }

  const records: import("../postcall/payload").CallRecord[] = [];
  const seen = new Set<string>();
  let ignored = 0;
  let worst: { status: Accepted["status"]; reason: string } | null = null;
  for (const e of events) {
    const v = await verifyWithVaani(e, deps.vaani, deps.now?.());
    if (!v.ok) {
      // 503 (Vaani still processing) wins so Vaani retries; otherwise keep the first failure.
      if (!worst || v.status === 503) worst = { status: v.status as Accepted["status"], reason: v.reason };
    } else if (v.kind === "ignored") ignored++;
    else if (!seen.has(v.callId)) {
      seen.add(v.callId);
      records.push(v.record);
    }
  }

  if (records.length === 0) {
    if (worst) {
      await deps.store.markEvent(eventId, "failed", worst.reason);
      return { status: worst.status, json: { error: worst.reason } };
    }
    await deps.store.markEvent(eventId, "ignored");
    return { status: 200, json: { status: "ignored", events: ignored } };
  }
  // If one call in a batch is still being processed by Vaani, ask for a retry: processing is idempotent.
  if (worst?.status === 503) {
    await deps.store.markEvent(eventId, "failed", worst.reason);
    return { status: 503, json: { error: worst.reason } };
  }
  return {
    status: 200,
    json: { status: "accepted", call_ids: records.map((r) => r.callId) },
    after: async () => {
      let error: string | null = null;
      for (const record of records) {
        try {
          await process(record);
        } catch (err) {
          error = String((err as Error).message).slice(0, 500);
        }
      }
      await deps.store.markEvent(eventId, error ? "failed" : "processed", error ?? undefined);
    },
  };
}

function callIdFrom(e: Record<string, unknown>): string | null {
  const data = (typeof e.data === "object" && e.data ? e.data : {}) as Record<string, unknown>;
  for (const v of [data.call_id, e.call_id, data.room_name, e.room_name]) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export type { ProcessDeps };
export { processCall };
