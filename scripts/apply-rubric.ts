/**
 * Apply rubric proposals that Nikhil approved: write knowledge/qualified.md, mark them applied, then run
 * npm run vaani:sync so the voice agent gets the new rubric. Commit the file afterwards.
 *   npm run rubric:apply
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import pg from "pg";

const root = join(import.meta.dirname, "..");
try { loadEnvFile(join(root, ".env.local")); } catch { /* env may already be set */ }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const { rows } = await pool.query<{ id: string; proposed_text: string; rationale: string }>(
  "select id, proposed_text, rationale from rubric_proposals where state = 'approved' and applied_at is null and proposed_text is not null order by decided_at",
);
if (rows.length === 0) { console.log("No approved proposals waiting."); await pool.end(); process.exit(0); }
const file = join(root, "knowledge", "qualified.md");
for (const r of rows) {
  const before = readFileSync(file, "utf8");
  if (r.proposed_text.trim() === before.trim()) { console.log(`Proposal ${r.id} already matches the file.`); }
  else { writeFileSync(file, r.proposed_text); console.log(`Applied proposal ${r.id}: ${r.rationale}`); }
  await pool.query("update rubric_proposals set applied_at = now() where id = $1", [r.id]);
}
await pool.end();
console.log("Syncing the voice agent...");
execSync("npm run -s vaani:sync", { stdio: "inherit", cwd: root });
console.log("Done. Review `git diff knowledge/qualified.md` and commit it.");
