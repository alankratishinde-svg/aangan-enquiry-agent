import { join } from "node:path";
import pg from "pg";
import { CalcomRestClient, type CalcomClient } from "../lib/calcom";
import { loadConfig, type Config } from "../lib/config";
import { ResendClient, type EmailSender } from "../lib/email";
import { geminiFromEnv, type GeminiClient } from "../lib/gemini";
import { pgDb, type Db } from "../lib/postcall/db";
import { HubspotRestClient, type HubspotClient } from "../lib/postcall/hubspot";
import type { ProcessDeps } from "../lib/postcall/process";
import { PostCallStore } from "../lib/postcall/store";
import { VaaniRestClient, type VaaniClient } from "../lib/vaani/client";

const g = globalThis as unknown as { __aanganPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  g.__aanganPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 20_000 });
  return g.__aanganPool;
}
export const db = (): Db => pgDb(pool());
export const store = () => new PostCallStore(db());
export const config = (): Config => loadConfig({ ...process.env, KNOWLEDGE_DIR: join(process.cwd(), "knowledge") });
export const gemini = (): GeminiClient => geminiFromEnv();
export const vaani = (): VaaniClient => {
  if (!process.env.VAANI_API_KEY) throw new Error("VAANI_API_KEY is not set");
  return new VaaniRestClient({ apiKey: process.env.VAANI_API_KEY, baseUrl: process.env.VAANI_API_URL });
};
export const calcom = (): CalcomClient | null =>
  process.env.CALCOM_API_KEY && process.env.CALCOM_EVENT_TYPE_ID
    ? new CalcomRestClient({ apiKey: process.env.CALCOM_API_KEY, eventTypeId: Number(process.env.CALCOM_EVENT_TYPE_ID) })
    : null;
export const email = (): EmailSender | null =>
  process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL ? new ResendClient({ apiKey: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL }) : null;
export const hubspot = (): HubspotClient | null =>
  process.env.HUBSPOT_ACCESS_TOKEN
    ? new HubspotRestClient({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN, pipelineLabel: process.env.HUBSPOT_PIPELINE_NAME, stageLabel: process.env.HUBSPOT_STAGE_QUALIFIED })
    : null;

export function processDeps(): ProcessDeps {
  return {
    store: store(), gemini: gemini(), config: config(), hubspot: hubspot(), calcom: calcom(), email: email(),
    dashboardBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  };
}
