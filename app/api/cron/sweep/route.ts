import { acceptWebhook } from "../../../../src/lib/webhook/handler";
import { processCall } from "../../../../src/lib/postcall/process";
import { db, processDeps, store, vaani } from "../../../../src/server/runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily safety net. Webhooks that were stored but not processed (a crash, a Gemini outage) are replayed through the
 * same path: the call is re-read from Vaani, so nothing here trusts the stored body either.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const rows = (
    await db().query<{ id: string; payload: unknown }>(
      `select id, payload from webhook_events
        where event = 'call_postprocessing' and state in ('received', 'failed') and attempts < 5 and received_at < now() - interval '5 minutes'
        order by received_at limit 20`,
    )
  ).rows;
  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    const r = await acceptWebhook(
      { token: process.env.VAANI_WEBHOOK_TOKEN ?? null, body: row.payload, eventId: row.id },
      { store: store(), vaani: vaani(), expectedToken: process.env.VAANI_WEBHOOK_TOKEN },
      (record) => processCall(record, processDeps()),
    );
    if (r.after) await r.after();
    if (r.status === 200) processed++;
    else failed++;
  }
  return Response.json({ checked: rows.length, processed, failed });
}
