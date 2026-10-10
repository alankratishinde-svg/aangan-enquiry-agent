import { buildContextBundle, ContextLoadError, type BundleDeps, type ContextBundle } from "./context-bundle";
import { isAfterHours } from "./slots";

/** What the caller hears when the studio cannot start the call properly. No price, no promise beyond the callback. */
export const POLITE_FAILURE_MESSAGE =
  "I'm sorry, we're having a technical problem on our side right now. We'll call you back within the hour. Thank you for your patience.";

/** One row for the front desk callback list. Maps 1:1 onto the `calls` table. */
export interface FailedCallRecord {
  vaaniCallId: string;
  callerNumber: string | null;
  startedAt: Date;
  status: "failed";
  failureReason: string;
  isAfterHours: boolean;
  callbackDueAt: Date;
}

export interface CallStore {
  recordFailedCall(record: FailedCallRecord): Promise<void>;
}

export class InMemoryCallStore implements CallStore {
  readonly failed: FailedCallRecord[] = [];
  failWith: Error | null = null;
  async recordFailedCall(record: FailedCallRecord): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.failed.push(record);
  }
}

export type StartCallResult =
  | { ok: true; bundle: ContextBundle }
  | {
      ok: false;
      /** Say this to the caller, then end the call. */
      message: string;
      failed: FailedCallRecord;
      /** False if the store write failed: the caller of startCall must retry persisting `failed`. */
      recorded: boolean;
    };

export interface StartCallInput {
  vaaniCallId: string;
  callerNumber: string | null;
  deps: BundleDeps;
  store: CallStore;
}

/**
 * Call start. Builds the context bundle. If that fails, the caller still hears a
 * polite message and the call goes on the front desk callback list with
 * `callback_due_at` set (hard rule 3 plus section 9 failure handling).
 */
export async function startCall(input: StartCallInput): Promise<StartCallResult> {
  const now = (input.deps.now ?? (() => new Date()))();
  try {
    return { ok: true, bundle: await buildContextBundle(input.deps) };
  } catch (err) {
    const reason =
      err instanceof ContextLoadError ? err.message : `Unexpected error building call context: ${(err as Error).message}`;
    const failed: FailedCallRecord = {
      vaaniCallId: input.vaaniCallId,
      callerNumber: input.callerNumber,
      startedAt: now,
      status: "failed",
      failureReason: reason,
      isAfterHours: isAfterHours(now, input.deps.config),
      callbackDueAt: new Date(now.getTime() + input.deps.config.callbackTargetMinutes * 60_000),
    };
    let recorded = true;
    try {
      await input.store.recordFailedCall(failed);
    } catch {
      recorded = false;
    }
    return { ok: false, message: POLITE_FAILURE_MESSAGE, failed, recorded };
  }
}
