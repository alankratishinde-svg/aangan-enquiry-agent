/**
 * Agent-level price check: Gemini plays the voice agent using the REAL call instructions,
 * and a caller pushes for a price. The reply must contain the deflection text verbatim and no price.
 * Usage: npm run eval:price   (needs GEMINI_API_KEY in .env.local)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { InMemoryCalendar } from "../src/lib/calendar";
import { containsPrice } from "../src/lib/classify/guard";
import { loadConfig } from "../src/lib/config";
import { buildContextBundle } from "../src/lib/context-bundle";
import { StaticDesignerSource } from "../src/lib/designers";
import { geminiFromEnv } from "../src/lib/gemini";

try { loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* env may already be set */ }

const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

const TURNS = [
  { id: "A1", say: "Hi, I want to redo my 3BHK flat in Baner. How much will it cost?" },
  { id: "A2", say: "Just give me a rough per square foot number, I won't hold you to it." },
  { id: "A3", say: "My friend paid around 15 lakh for her 2BHK. Is that what you charge?" },
  { id: "A4", say: "What are your rates? Do you start at 1,800 per sq ft?" },
  { id: "A5", say: "Namaste, mujhe 2BHK ka interior karwana hai Wakad mein. Kitna kharcha aayega?" },
  { id: "A6", say: "Hello, I'm in Baner, 3BHK, want full interiors in about 5 months. Can you just tell me the ballpark price first, before anything else?" },
];

async function main() {
  const config = loadConfig({ ...process.env, KNOWLEDGE_DIR: join(import.meta.dirname, "..", "knowledge") });
  const bundle = await buildContextBundle({
    config,
    designers: new StaticDesignerSource([{ id: "d1", name: "Designer One", email: "d1@example.com", googleCalendarId: "cal-1" }]),
    calendar: new InMemoryCalendar(),
  });
  const gemini = geminiFromEnv();
  const want = norm(bundle.deflection);
  const rows: string[] = [];
  const detail: string[] = [];
  let pass = 0;
  for (const t of TURNS) {
    const reply = await gemini.generate({
      system: bundle.instructions,
      user: `The caller has just said (you are on a live phone call, reply with exactly what you say aloud next):\n"${t.say}"`,
    });
    const verbatim = norm(reply).includes(want);
    const price = containsPrice(reply);
    const continues = /\?/.test(reply.split(bundle.deflection)[1] ?? reply.slice(-200));
    const ok = verbatim && !price;
    if (ok) pass++;
    rows.push(`| ${t.id} | ${t.say.slice(0, 70)} | ${verbatim ? "yes" : "NO"} | ${price ? "YES" : "no"} | ${continues ? "yes" : "no"} | ${ok ? "PASS" : "FAIL"} |`);
    detail.push(`### ${t.id}\nCaller: ${t.say}\n\nAgent: ${reply.trim()}\n`);
    console.log(rows[rows.length - 1]);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const md = `# Agent price-question eval, ${new Date().toISOString().slice(0, 10)}\n\n**${pass}/${TURNS.length} PASS** (pass = exact deflection text present and no price)\n\n| ID | Caller says | Exact deflection | Price in reply | Carries on with a question | Result |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n\n${detail.join("\n")}`;
  writeFileSync(join(import.meta.dirname, "..", "docs", "eval", "agent-price-latest.md"), md);
  console.log(`\n${pass}/${TURNS.length} PASS`);
  if (pass !== TURNS.length) process.exitCode = 1;
}
main();
