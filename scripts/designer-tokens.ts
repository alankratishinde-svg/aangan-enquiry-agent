/**
 * Create a personal sign-in link for every active designer. Only the hash is stored in the database.
 * The links go to .designer-links.txt (gitignored), never to the terminal. Running it again replaces old links.
 *   npm run designers:links
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { hashToken } from "../src/server/token";

const root = join(import.meta.dirname, "..");
try { loadEnvFile(join(root, ".env.local")); } catch { /* env may already be set */ }

const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const { rows } = await pool.query<{ id: string; name: string; email: string }>("select id, name, email from designers where active order by name");
const lines: string[] = [];
for (const d of rows) {
  const token = randomBytes(24).toString("base64url");
  await pool.query("update designers set access_token_hash = $2 where id = $1", [d.id, hashToken(token)]);
  lines.push(`${d.name} <${d.email}>\n  ${base}/designer/login?token=${token}`);
}
writeFileSync(join(root, ".designer-links.txt"), lines.join("\n\n") + "\n", { mode: 0o600 });
console.log(`Wrote ${rows.length} sign-in links to .designer-links.txt (not shown here, not committed).`);
await pool.end();
