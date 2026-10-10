import { processCall, type ProcessDeps, type ProcessResult } from "../postcall/process";
import type { PostCallStore } from "../postcall/store";
import type { VaaniClient } from "../vaani/client";
import { tokenOk, verifyWithVaani } from "./verify";

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

  const b = (input.body && typeof input.body === "object" ? input.body : {}) as Record<string, unknown>;
  const eventName = typeof b.event === "string" ? b.event : "unknown";
  const rawCallId = typeof (b.data as Record<string, unknown> | undefined)?.call_id === "string" ? ((b.data as Record<string, unknown>).call_id as string) : typeof b.call_id === "string" ? b.call_id : null;
  const eventId = input.eventId ?? (await deps.store.recordEvent(eventName, rawCallId, input.body));

  const v = await verifyWithVaani(input.body, deps.vaani, deps.now?.());
  if (!v.ok) {
    await deps.store.markEvent(eventId, "failed", v.reason);
    return { status: v.status as Accepted["status"], json: { error: v.reason } };
  }
  if (v.kind === "ignored") {
    await deps.store.markEvent(eventId, "ignored");
    return { status: 200, json: { status: "ignored", event: v.event } };
  }
  return {
    status: 200,
    json: { status: "accepted", call_id: v.callId },
    after: async () => {
      try {
        await process(v.record);
        await deps.store.markEvent(eventId, "processed");
      } catch (err) {
        await deps.store.markEvent(eventId, "failed", String((err as Error).message).slice(0, 500));
      }
    },
  };
}

export type { ProcessDeps };
export { processCall };
