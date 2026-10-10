/** Connectivity smoke test: npm run db:check */
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import pg from "pg";

try { loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* env may already be set */ }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const t = await client.query<{ n: number }>("select count(*)::int n from information_schema.tables where table_schema = 'public'");
const d = await client.query<{ n: number }>("select count(*)::int n from designers");
const w = await client.query<{ ok: number }>("insert into calls (vaani_call_id, started_at, status, failure_reason) values ('db-check', now(), 'failed', 'db check') returning 1 ok");
await client.query("delete from calls where vaani_call_id = 'db-check'");
console.log(`connected as ${(await client.query("select current_user u")).rows[0].u}: ${t.rows[0]!.n} public tables, ${d.rows[0]!.n} designers, write+delete ${w.rows[0]!.ok === 1 ? "ok" : "FAILED"}`);
await client.end();
