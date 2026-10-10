/**
 * Demo rows for looking at the dashboards. Every row is tagged with a vaani_call_id that starts with "demo-".
 *   npm run demo:seed      add them
 *   npm run demo:clean     remove them (calls cascade to leads, requirements and review items)
 */
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import pg from "pg";

try { loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* env may already be set */ }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = (t: string, p: unknown[] = []) => pool.query(t, p);

async function clean() {
  await q("delete from decisions where lead_id in (select l.id from leads l join calls c on c.id = l.call_id where c.vaani_call_id like 'demo-%')");
  await q("delete from calls where vaani_call_id like 'demo-%'");
  await q("delete from weekly_summaries where improvement_summary like '[demo]%'");
  await q("delete from rubric_proposals where rationale like '[demo]%'");
}

async function seed() {
  await clean();
  const d = (await q("select id from designers where active order by name limit 1")).rows[0].id as string;
  const call = async (id: string, status: string, o: Record<string, unknown> = {}) =>
    (await q(`insert into calls (vaani_call_id, started_at, ended_at, status, failure_reason, callback_due_at, price_spoken, booking_before_qualified, response_seconds, summary, transcript, caller_number)
              values ($1, now() - $2::interval, now() - $2::interval + interval '5 minutes', $3, $4, $5, $6, $7, 0, $8, $9, '+919800011122') returning id`,
      [id, o.ago ?? "2 hours", status, status === "failed" ? "Post-call analysis failed" : null, o.due ?? null, o.price ?? false, o.booking ?? false, o.summary ?? null, o.transcript ?? "AGENT: Hello, thank you for calling Aangan Studio.\n\n USER: I want my 3BHK in Baner redone.\n\n AGENT: Lovely."])).rows[0].id as string;
  const lead = async (callId: string, o: Record<string, unknown>) =>
    (await q(`insert into leads (call_id, name, phone, email, project_type, area_sq_ft, location, needed_by, summary, client_size, handoff_notes, add_on_tips, internal_estimate, assigned_designer_id, booked_slot)
              values ($1,$2,'+919800011122',$3,$4,$5,$6,'2027-03-01',$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13) returning id`,
      [callId, o.name, o.email ?? null, o.type, o.area ?? null, o.loc, o.summary, o.size ?? null, JSON.stringify(o.notes ?? []), JSON.stringify(o.tips ?? []), o.est ? JSON.stringify({ text: o.est }) : null, o.designer ?? null, o.slot ?? null])).rows[0].id as string;

  const c1 = await call("demo-q1", "qualified", { summary: "3BHK full redesign in Baner." });
  const l1 = await lead(c1, { name: "Rahul Sharma", email: "rahul@example.com", type: "full_home", area: 1200, loc: "Baner", summary: "Wants a full 3BHK redesign with execution, to be ready in about five months.", size: "Full home", designer: d,
    slot: new Date(Date.now() + 2 * 86400000).toISOString(), notes: ["Decision-maker unclear: caller said the flat is shared with a sibling."],
    tips: [{ title: "Layered lighting plan", detail: "Warm layered lighting would suit the open living and dining area." }, { title: "Built-in wardrobes", detail: "Built-ins in the bedrooms could save floor space in a 3BHK." }],
    est: "Rs 21.6 lakh to Rs 42 lakh (1200 sq ft, standard to premium specification). Internal, indicative only, not for the client." });
  for (const [i, delivered] of [["Living room redesign", true], ["Modular kitchen", false], ["Bedroom wardrobes", false], ["Lighting design", true]] as const) await q("insert into requirements (lead_id, item, delivered) values ($1,$2,$3)", [l1, i, delivered]);
  const c2 = await call("demo-q2", "qualified", { ago: "1 day" });
  await lead(c2, { name: "Priya Nair", email: "priya@example.com", type: "single_room", loc: "Wakad", summary: "Complete redesign of the master bedroom.", size: "Single room", designer: d, est: "Rs 3.5 lakh to Rs 8 lakh (single room redesign range). Internal, indicative only, not for the client.", tips: [{ title: "Wardrobe wall", detail: "A full-height wardrobe wall could replace freestanding pieces." }, { title: "Bedside lighting", detail: "Layered lighting suits a bedroom." }] });

  const c3 = await call("demo-u1", "unqualified", { ago: "3 hours" });
  const l3 = await lead(c3, { name: "Vikram Desai", type: "full_home", loc: "Talegaon", summary: "3BHK redesign in Talegaon." });
  await q("insert into review_queue (lead_id, kind, reasons) values ($1,'unqualified',$2::jsonb)", [l3, JSON.stringify([{ type: "unqualified", decline_reason: "We currently serve Pune city and Pimpri-Chinchwad only.", criteria: [{ criterion: "service_area", status: "fail", evidence: "Talegaon is outside Pune city and PCMC." }] }])]);
  const c4 = await call("demo-c1", "qualified", { ago: "5 hours", price: true, booking: true });
  const l4 = await lead(c4, { name: "Amit Joshi", email: "amit@example.com", type: "full_home", loc: "Aundh", summary: "3BHK in Aundh.", designer: d });
  await q("insert into review_queue (lead_id, kind, reasons) values ($1,'compliance',$2::jsonb)", [l4, JSON.stringify([{ type: "price_spoken", regex_hits: [{ turn: 2, text: "For a 3BHK it usually costs around 15 to 20 lakh." }], gemini_evidence: [] }, { type: "booking_before_qualified", booking_started_turn: 2, qualifying_complete_turn: 6, booked_before_info_complete: true, booked_while_not_qualified: false }])]);
  await call("demo-f1", "failed", { ago: "30 minutes", due: new Date(Date.now() + 30 * 60000).toISOString() });
  await call("demo-f2", "failed", { ago: "3 hours", due: new Date(Date.now() - 2 * 3600000).toISOString() });
  const mon = new Date(); mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7) - 7);
  await q("insert into weekly_summaries (week_start, counts, improvement_summary) values ($1, '{}'::jsonb, $2) on conflict (week_start) do update set improvement_summary = excluded.improvement_summary", [mon.toISOString().slice(0, 10), "[demo]\n- Most unqualified calls this week were outside the service area (4).\n- Two unqualified calls were converted by the front desk; both said they wanted the whole flat redone but did not say 'execution'.\n- One call had the agent say a price and one booked before the details were complete. Both are on the front desk list.\n- Suggestion: ask 'Would you like us to handle the full work, design and execution?' when the caller only says 'redo my flat'."]);
  await q("insert into rubric_proposals (diff, rationale, proposed_text) values ($1,$2,$3)", ["--- current\n+++ proposed\n@@ -30,3 +30,4 @@\n - Not knowing exactly what they want (that's the consultation's job)\n+- Saying \"redo my whole flat\" without the word execution\n", "[demo] Two converted leads said 'redo my whole flat' and were first treated as unclear on real project. The edit treats that wording as a real project.", "demo"]);
}

if (process.argv.includes("--clean")) { await clean(); console.log("Demo rows removed."); } else { await seed(); console.log("Demo rows added."); }
await pool.end();
