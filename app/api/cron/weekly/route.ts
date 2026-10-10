import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runWeekly } from "../../../../src/lib/weekly";
import { db, gemini } from "../../../../src/server/runtime";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Weekly summary for Nikhil and a draft rubric proposal. Vercel cron calls this with the CRON_SECRET bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const rubricMd = await readFile(join(process.cwd(), "knowledge", "qualified.md"), "utf8");
  const r = await runWeekly(db(), { gemini: gemini(), rubricMd });
  return Response.json({ weekStart: r.weekStart, proposalId: r.proposalId });
}
