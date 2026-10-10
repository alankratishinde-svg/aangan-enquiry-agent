import { after } from "next/server";
import { acceptWebhook } from "../../../../src/lib/webhook/handler";
import { processCall } from "../../../../src/lib/postcall/process";
import { processDeps, store, vaani } from "../../../../src/server/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vaani call_postprocessing webhook. Register in Vaani (Settings, Webhooks) as
 *   https://<app>/api/vaani/webhook?token=<VAANI_WEBHOOK_TOKEN>
 * The body is never trusted: we re-read the call from Vaani with our own API key.
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const body = await req.json().catch(() => null);
  const r = await acceptWebhook({ token, body }, { store: store(), vaani: vaani(), expectedToken: process.env.VAANI_WEBHOOK_TOKEN }, (record) =>
    processCall(record, processDeps()),
  );
  if (r.after) after(r.after);
  return Response.json(r.json, { status: r.status });
}

export function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}
