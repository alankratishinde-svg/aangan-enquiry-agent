# PROGRESS

## CURRENT STATUS (end of session, 2026-10-10)
Production: https://aangan-enquiry-agent-henna.vercel.app (Vercel project `aangan-enquiry-agent`, region sin1, built from GitHub `main`). Neon DB `aangan`. Voice agent in Vaani (id in `VAANI_AGENT_ID`). Stack-only (hard rule): Vaani, Gemini Flash, Cal.com, Resend, HubSpot, Neon, Vercel, GitHub.

### Done and verified
- M1 Foundation. M2 knowledge loader (kept for prompt sync and classification). M3 classification, 42/42 live cases.
- M4 Vaani: agent created and its prompt synced from the knowledge files (`npm run vaani:sync`); webhook route `POST /api/vaani/webhook?token=...` live on Vercel. Auth: Vaani documents none for call events, so: URL token (fail closed, constant time) + the body is never trusted: the call is re-read from Vaani with our API key (`GET /api/call_details/{id}`; real Vaani answers 404 for an unknown id, tested live). Replies 200 fast, processes after the reply, stores every raw body first (`webhook_events`), daily sweep replays failures.
- M5 Booking: Cal.com 45 min event type `aangan-consultation` (id 7422070, Mon to Sat 10:00 to 19:00 IST). Vaani's own Cal.com tools book during the call; after the call we find the booking by the caller's email and store it. Designers are assigned round robin by fewest open leads (placeholder: one calendar for all).
- M6 Post-call: transcript read by Gemini, same rule engine, price check, booking-before-qualified check, one DB transaction, then per qualified lead: booking lookup, designer, internal estimate parsed from `pricing.md` (labelled, or "See pricing.md"), summary plus exactly 2 add-on tips (Gemini prompt `lead_summary.v1`), checklist from what the caller asked for, HubSpot deal (qualified only), designer email (Resend). Each step records its own error and is safe to repeat.
- M7 Dashboards, reorganised on user request (2026-10-10, replaces the single page): Home `/` (title, calls today / qualified / waiting for review since midnight IST, two big cards with sub-page links, test mode banner). Designer dashboard `/designer` with a designer dropdown from the `designers` table (no login in test mode, choice kept in a cookie): `/designer/leads` (need, notes, booked slot, call summary, progress, 2 tips, labelled internal estimate), `/designer/consultations` (upcoming bookings on the designer's leads), `/designer/calls/[id]` (transcript, verdict, flags; only the designer's own calls). Nikhil dashboard `/nikhil`: overview (calls, qualified vs unqualified, share answered, average response vs 300 s target), `/nikhil/review` (delete or convert), `/nikhil/callbacks`, `/nikhil/flags`, `/nikhil/rubric`, `/nikhil/cost` (Indicative, from env only), `/nikhil/improve` (Gemini suggestions, button regenerates), `/nikhil/calls/[id]`. Old `/frontdesk` and `/frontdesk/callbacks` redirect to `/nikhil/review` and `/nikhil/callbacks`. No price is shown on any page except the designer-only internal estimate: call text goes through `safeText` (money redacted). Cost page shows the studio's own Indicative cost and value from env vars (not client prices). No migration was needed.
- M8 Fallback and metrics: failed calls go on the callback list with `callback_due_at` = call end + 60 min; page shows overdue; metrics: answered under 5 min, failed called back within the hour (share, median minutes, overdue), price flags, booking flags, converted/deleted.
- M9 Weekly job `/api/cron/weekly` (Mondays): numbers, Gemini written improvement summary (prompt `weekly_summary.v1`), and a DRAFT rubric change (prompt `rubric_proposal.v1`) only when the front desk converted at least 2 unqualified leads; guarded (keeps structure, no new money figure). Approval screen for Nikhil. Approved changes are applied by `npm run rubric:apply` (writes `knowledge/qualified.md`, re-syncs Vaani); Vercel cannot write files, so this step is run by a developer, then commit.
- M10 End to end: `npm run eval:e2e`, 14/14 PASS with live Gemini (qualified, unqualified, failed, price question clean, price question where the agent names a price). Also `eval:classify` 42/42, `eval:postcall` 9/9, `eval:price` 6/6. 161 unit tests.

### Pending, needs the user
1. Vercel Deployment Protection: the production URL answered 200 to the public at the time of testing, so the webhook is reachable. If Vercel Authentication is enabled for the project it would block Vaani and designers: check Settings, Deployment Protection (I do not change security settings).
2. Register the webhook in Vaani (Settings, Webhooks): `https://aangan-enquiry-agent-henna.vercel.app/api/vaani/webhook?token=<VAANI_WEBHOOK_TOKEN from .env.local>`. No Vaani API exists for this.
3. In the Vaani dashboard attach the Cal.com tools to the agent, confirm the Cal.com key and event type `aangan-consultation` in Integrations.
4. HubSpot: approve creation of the pipeline "Aangan Enquiries" and 7 deal properties (the connector asks for approval), and give a private app token as `HUBSPOT_ACCESS_TOKEN` (add to Vercel env too). Until then deals are skipped with `not_configured`, calls are still saved.
5. Resend: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (add to Vercel env too). Until then designer emails are skipped; the lead still shows on the dashboard.
6. Designer sign-in links: `npm run designers:links` writes `.designer-links.txt` (gitignored) with one link per designer. Send them. Real designer names, emails and calendars replace the 4 placeholders (update the `designers` table).
7. Change the production passwords (`FRONT_DESK_PASSWORD`, `NIKHIL_PASSWORD`) and rotate every key that was pasted in chat before real calls (Vaani, Cal.com, Gemini, Neon password). They are set in Vercel as sensitive env vars.
8. Web test calls (docs/web-test-plan.md): normal, price question, Hindi. Then a phone number in Vaani Telephony. Marathi: UNVERIFIED.
9. Nikhil confirmations (listed below), approved Hindi/Marathi deflection wording.
10. `/enquiries/` transcripts for the replay test (placeholder test exists).

### Front-end look (2026-10-10)
Palette after the Ardea reference the user gave: forest `#243029`, cream `#efebe3`, sand `#d9ccb4`, terracotta `#c4561c` (the one accent), teal and walnut. Type: Cormorant Garamond Light for display (lining numerals), Poppins for UI. Hero image `public/hero-lounge.jpg` was generated with Gemini (`gemini-2.5-flash-image`), original, no text. Floating cream top bar, frosted-glass bars for live counts and controls, one hero reveal (off for reduced motion).

### Cost page setup
Set on Vercel (and `.env.local`): `COST_PER_CALL_INR`, `INDICATIVE_CONVERSION_PCT` (blank today: the page says "not set", nothing is guessed), `INDICATIVE_PROJECT_VALUE_LOW_INR` / `_HIGH_INR` (8 and 14 lakh from the brief), `HUBSPOT_PORTAL_ID` (for the deals link).

### Synthetic test calls (2026-10-10, `npm run test:call -- qualified|price|unqualified|hindi`)
- A synthetic caller joins a Vaani WebRTC session (macOS `say` voices, LiveKit client), talks to the real agent, and the call reaches the dashboard through the real production webhook. Real Vaani minutes are used.
- Bugs found and fixed by the first calls: (1) Vaani separates transcript turns with ONE newline, my parser needed a blank line, so every real call was saved as "failed: no caller speech" (fixed in `parseTranscript`, regression tests use the captured real delivery); (2) `call_duration` arrives in seconds, not ms as documented: start and end now come from `call_started_at` / `call_ended_at`; (3) `phone_number: "web-user"` for web calls was stored as a number; (4) batch envelope `{event, events:[...]}` and the `webhook_test` ping are handled; (5) the agent skipped the size question and ASR turned "Baner" into "Barnet": agent prompt now lists what to collect before contact details, extraction prefers the agent's confirmed spelling.
- Results: qualified call (agent greeting, name, location, timing, decision-maker, email and phone read back) lands as a qualified lead; price call: all three price questions got the exact approved sentence and no number, no price flag. The agent did NOT book: Cal.com tools are not attached to the agent yet (user step).
- Not yet run live: unqualified and Hindi scenarios.

### If a Vaani call does not show on the dashboard (found 2026-10-10)
- Cause that day: the webhook was never registered in Vaani (agent config `webhook` is null; the Neon `webhook_events` table held only our own 4 test rows). Register `https://aangan-enquiry-agent-henna.vercel.app/api/vaani/webhook?token=<VAANI_WEBHOOK_TOKEN>` in Vaani, Settings, Webhooks. A request with a wrong or missing token gets 401 and is not logged.
- Backfill a call that already happened: `npm run vaani:ingest -- <call_id>` (call id from Vaani, Conversations, History). It uses the same verified path as the webhook.
- Vaani's `GET /api/call-history` returns 500 "Invalid client_id format" for this account (a Vaani backend error, checked with the key), so calls cannot be listed through the API; the id has to come from the dashboard.
- Vercel runtime logs are not readable from this session (403).

### Known limits (honest)
- No in-call enforcement: no-price and no-early-booking rely on the agent prompt; the post-call check flags what slips through. Hindi recognition and Marathi are untested.
- The caller's phone number is not in the documented `call_postprocessing` payload; we use it if Vaani sends it, else the number the caller says. Check with a real call.
- Booking lookup matches by the email the caller gave. A mis-heard email means "No Cal.com booking found" appears as a note and the designer is told to arrange a time.
- One Cal.com calendar for all designers; assignment is round robin, not by availability.
- HubSpot, Resend and the Vaani webhook delivery are only tested against mocks and the documented shapes, not live.
- Cron jobs run daily and weekly (Vercel Hobby limit); the callback list is a page, not a push alert.
- `response_seconds` is stored as 0 when the agent greeted (Vaani answers at once); ring time is not in the payload.

### Commands
`npm test` · `npm run typecheck` · `npm run dev` · `npm run vaani:sync` (after any change to knowledge/*.md) · `npm run calcom:setup` · `npm run designers:links` · `npm run rubric:apply` · `npm run demo:seed` / `demo:clean` · `npm run check:transcript -- file.txt` · `npm run eval:classify|postcall|price|e2e` · `npm run db:check`.

---
(Older notes below, newest context first is above.)

## Status (2026-10-10)
- DATABASE MOVED TO NEON. Project `aangan-enquiry-agent` (id `bold-bar-64838202`, Singapore, Postgres 17, database `aangan`, role `aangan_owner`). Schema and 4 placeholder designers applied; verified through the real app path (`npm run db:check`: connects, 8 tables, 4 designers, write+delete ok). `DATABASE_URL` is in `.env.local` only. Migrations now live in `db/migrations/0001_init.sql` and `db/seed.sql` (folder `supabase/` removed).
- Aangan tables dropped from the shared Supabase project (they held only the 4 seeded designers). Two Tickets tables untouched (verified). Supabase variables removed from this project's env.
- Row level security is on for all 8 tables with no policies (deny for any non-owner role). The Supabase `auth.uid()` designer policies are gone: the Next.js backend connects as the owner and scopes designers to their own leads in code (Milestone 7). `designers.auth_user_id` is now text.
- The schema was applied through the Neon connector in one transaction; there is no migration runner yet. Add one (`db:migrate`) when the Next.js app lands.

- Milestone 1 (Foundation): DONE. Migrations apply cleanly.
- Milestone 2 (Context bundle and knowledge loader): DONE. 21 tests in `tests/context-bundle.test.ts`, all pass. Includes the acceptance test (edit a knowledge file, next call reflects it). `npm test` = 29 pass, 1 skipped placeholder. `npm run typecheck` clean.
- Pre-M3 fallback: DONE. If call context fails to build, caller hears the polite callback message and a failed-call record with `callback_due_at` (now + 60 min) is written to the callback list. `src/lib/call-start.ts`, 7 tests.
- Milestone 3 (Classification): DONE. `classify_lead` + Gemini prompt (a) + rule engine. Live eval against real Gemini: 42/42 PASS (`npm run eval:classify`, report in `docs/eval/classification-latest.md`). Agent price check: 6/6 PASS (`npm run eval:price`, `docs/eval/agent-price-latest.md`). Unit tests: `npm test` (mock Gemini, no network).
- DECISION (2026-10-10, user): STACK-ONLY. The course slide stack is a hard rule: Claude Chat, Claude Code, Vaani Labs, Gemini Flash, Cal.com/Calendly/Google Calendar, Telegram or Resend, HubSpot, Supabase/Neon, Vercel, GitHub. NO Fly.io, Railway or any separate server host, so NO BYOL (it needs a persistent WebSocket server, which Vercel cannot host). Milestone 4 is redesigned below.
- Next: Milestone 4 (Vaani native agent, stack-only). Needs from the user: a screenshot of the Vaani dashboard Agent Config (any Functions, Actions or Cal.com section) so we know what the native integration supports. `persona.actions.functions` is undocumented in Vaani's official API (openapi has only trigger-call, call-history, transcript, stream, call_details; agent config is dashboard-only).

### Milestone 4 redesign (stack-only)
1. Agent runs natively inside Vaani. Qualification questions and the never-say-price rules live in the agent prompt (built from knowledge files, pasted or synced into the dashboard config).
2. Booking uses Vaani's built-in Cal.com integration (verify in dashboard), only after the agent judges the lead qualified.
3. `call_postprocessing` webhook (transcript, summary, dispositions) lands on a Vercel API route. That route runs `classifyLead` + `applyRules` on the transcript, writes to Neon, creates the HubSpot deal for qualified calls, and sends the designer handoff (Telegram or Resend, student's choice, defended in the debrief).
Trade-offs to flag to Nikhil: code can no longer block booking mid-call; hard rule 1 (no price) is enforced by prompt plus a post-call check on the transcript; per-call fresh knowledge context is not possible for inbound calls, so knowledge files must be re-synced to the agent prompt when they change.
Milestone 5 (booking) now means Cal.com via Vaani, not a Google service account.
- Vercel: no Vercel token or API URL was found in any `.env` file (the `.env.local` and `.env.vercel` in ~/Downloads belong to another app). The Vercel connector in this session can deploy when Milestone 7 needs it.
- GitHub: private repo https://github.com/alankratishinde-svg/aangan-enquiry-agent (pushed).
- `.env.local` created (gitignored) with Vaani key, plus Gemini key and Supabase URL/service key copied from the Two Tickets project at user request.
- (Superseded 2026-10-10: database moved to Neon, see below.) Supabase: user chose to reuse project `nygjjubcosuregacjacm` (mesa-ai-track, ap-south-1, shared with Two Tickets). Migration `aangan_init` APPLIED on 2026-10-07 via MCP, plus the 4 placeholder designers. Verified: 8 Aangan tables, RLS on for all 8, 4 designers. No name collisions. Aangan tables share a DB with another app: consider moving to a dedicated project before real customer data arrives.
- Security advisor: Aangan tables only trigger INFO 'RLS enabled, no policy' (intended: service role only). Separate from Aangan: 5 Two Tickets tables (groups, members, constraints, listings, reactions) have RLS OFF, flagged ERROR by Supabase. Not touched. Remediation SQL: `alter table public.<t> enable row level security;` for each, but it blocks anon access, so Two Tickets code may need policies first.
- `SUPABASE_ANON_KEY` set to the project's publishable key.

## Milestone 1 delivered
- `knowledge/` (services, pricing, qualified), `CLAUDE.md`, `PROGRESS.md`, `.gitignore` (covers `.env.local`), `.env.example`.
- `supabase/migrations/20261007000000_init.sql`: 8 tables from the brief, RLS on all, indexes.
- `supabase/seed.sql`: 4 placeholder designers with test calendar IDs.
- `tests/migrations.test.ts`: runs migrations plus seed on real Postgres (PGlite, in-process, no cloud). Checks tables, RLS enabled, constraints, designer-only-sees-own-leads, calls hidden from `authenticated`.
- `tests/enquiries-replay.test.ts`: skipped placeholder until `/enquiries/` arrives.

## Milestone 2 delivered (`src/lib/`)
- `knowledge.ts`: reads services/pricing/qualified fresh per call, no cache. Missing file throws.
- `pricing.ts`: `extractDeflection` pulls the exact line from `pricing.md`. `agentSafePricingRules` returns only the "What the agent must never say" section.
- `instructions.ts`: builds the agent system prompt (role, hard rules, conversation flow, slots, services.md and qualified.md verbatim).
- `slots.ts`, `calendar.ts`, `designers.ts`: slot grid from config (45 min, 10am to 7pm, Mon to Sat), lead time, after-hours flag, free-slot search over a `CalendarAdapter` port (in-memory mock now, Google in Milestone 5).
- `context-bundle.ts`: `buildContextBundle` returns knowledge, deflection, next 8 free slots, instructions. Any failure throws `ContextLoadError` so a call can be marked failed.
- `config.ts`: env config. Only `Asia/Kolkata` supported (fixed +05:30, no DST).

### Design decisions in Milestone 2 (confirm ok)
- The rate tables in `pricing.md` are NOT put in the agent's instructions, only the deflection line and never-say rules. The agent cannot leak what it never sees. Brief says the agent builds from all three files; this is the safer reading of hard rule 1. The loader fails closed if the never-say section ever contains a rupee figure or the deflection line disappears. Internal estimates (Milestone 6) read `pricing.md` separately, server-side.
- `qualified.md` is passed verbatim and contains an example rupee amount (criterion 4). That is rubric text, not a price quote. Hard rule still forbids saying any price.
- Added `BOOKING_LEAD_MINUTES` (default 120): no slot starts sooner than that after the call. Not in the brief.
- Deflection language: exact text is English. For Hindi or Marathi callers the agent says it in English as written. Translating would change the approved wording. Ask Nikhil whether an approved Hindi/Marathi version is wanted.
- Offered slots: next 8 distinct start times, one designer per time (first in list). Fair rotation is Milestone 5.

## Milestone 3 delivered (`src/lib/classify/`, `src/lib/gemini.ts`, `prompts/classify_lead.v1.md`)
- `classifyLead(callId, answers, deps)`: Gemini judges each criterion, `applyRules` (pure code) decides the verdict. Gemini's own `verdict` is stored as `gemini_verdict` for disagreement tracking only.
- Question limits: round 1 may ask one question per unclear criterion among 1 to 3 (never budget or decision-maker). Each criterion is asked at most once. Round 2 (the one re-run) never asks. A third call returns the stored result without calling Gemini. State is per call (`ClassifyStateStore`, in-memory for now).
- Rule overrides of Gemini: `weeks_until_needed` sets the timeline status from config (under 6 fail, 6 to under 10 unclear, 10+ pass; `timeline_firm` false passes, true fails). Commercial area: up to 3,000 pass, 3,001 to 3,300 one question, over 3,300 fail. Thresholds are config (`COMMERCIAL_MAX_SQFT`, `COMMERCIAL_BORDER_PCT`) because services.md says "approximately 3,000" in prose.
- Out-of-scope types (restaurant, hotel, retail, gym, structural work, decor only, furniture only, Vastu only) are judged by Gemini from `services.md`, not hardcoded. All 8 live cases passed.
- No price in any output: spoken fields (questions, decline reason) fall back to fixed safe text if a price appears; money figures are redacted from evidence and handoff notes. The caller's own budget figure lives only in `answers`. Tool response (`toToolResponse`) has no evidence or internals.
- Gemini: REST `generateContent`, `x-goog-api-key`, model `gemini-flash-latest` (resolved to gemini-3.8-flash on 2026-10-10), `thinkingLevel: low` for about 4 s per classification (default thinking was slower). `pricing.md` is never sent to Gemini.
- Agent instructions updated: "ask each question the tool returns, then call classify_lead once more".

### Decisions in Milestone 3 to confirm with Nikhil
1. Criterion 5 (decision-maker) never disqualifies alone, even if clearly failing: it becomes a handoff note. Matches "unclear 4 or 5: do not push".
2. Still unclear on criteria 1 to 3 after the one question: default is `unqualified` (goes to the front desk review queue, reversible). Flag `UNCLEAR_AFTER_RETRY=qualified` sends it to a designer with a note instead. Which does Nikhil prefer?
3. Budget "clearly too low" (criterion 4) is Gemini's judgement from the rubric example only. It does not see pricing.md. A code check against pricing.md floors is possible later if Nikhil wants it stricter.
4. 6 to 10 weeks is asked as "Is that finish date fixed, or could it be a little later if needed?" Flexible passes, fixed fails.
5. Caller whose timing, area or location stays vague after one question gets the graceful close, with an honest sentence that details could not be confirmed.

## Schema additions beyond the brief (confirm ok)
- `calls.callback_due_at`, `calls.called_back_at`: needed for the 1-hour callback metric (section 9).
- `designers.auth_user_id`, `designers.active`: needed for designer RLS and dashboard login.
- `leads.handoff_notes` (jsonb): the brief lists handoff notes in the email and cards but not as a column.
- `review_queue`: unique per lead. `decisions.lead_id` has no FK so decisions survive a deleted lead.
- DB check: a lead cannot get a designer until `email` is set (convert flow rule).
- `decisions.action` is free text for now. Will pin values in Milestone 7.
- `needed_by` is a `date`. Callers say "in 8 weeks"; the classifier will convert to a date.
- Migration test uses a stub for Supabase `auth.uid()` and roles. Real apply on Supabase happens when a project exists.

## Vaani findings (2026-10-07, from https://docs.vaanivoice.ai and the real API)
Docs: https://docs.vaanivoice.ai (index at /llms.txt, spec at /api-reference/openapi.json). API base: `https://api.vaanivoice.ai`. Auth header: `X-API-Key`. Key in `.env.local` verified: `GET /api/agents` returns 200 (bad key returns 401). Account has 0 agents, so no agent_id and no phone number yet.

| Need | Result |
|---|---|
| (a) Fresh context per INBOUND call | NOT documented. Per-call `metadata` and `modify_agent` exist only on Create Dispatch (`/api/trigger-call/`), which is outbound telephony or WebRTC. Inbound calls are routed by number (`deployment.Inbound`) with no per-call injection hook. |
| (b) Mid-call tool calls to our backend | NOT documented as a native feature. Agent config has `persona.actions.functions` (shape undocumented, provider-specific). Documented alternative: BYOL. Vaani opens one WebSocket per call to our server, sends every turn with full transcript plus system prompt, we stream back replies. We run the LLM, so `classify_lead` and `book_slot` are our own code. |
| (c) End-of-call webhook with transcript | YES, with a caveat. Webhooks are per-event (`call_started`, `call_ended`, ...). Transcript, summary, entities, dispositions, recording URL arrive in `call_postprocessing`, sent after `call_ended`. We store only `call_postprocessing` (plus `call_ended`/`call_failed` for failure handling). Payload carries no structured answers or verdict, so our backend must hold those itself. |
| (d) Hindi, Marathi, English | Hindi and English documented (`primary_language`, `secondary_language`, auto-detect flag). Dashboard bundle lists Marathi (`mr`) but docs do not confirm STT/TTS quality. Must test with a real Marathi call. Language params in docs are marked WebRTC only for Create Dispatch. |

Consequence: the brief's design (context loaded once, mid-call tool calls, one session) fits Vaani only through BYOL. BYOL needs a long-lived WebSocket server. Vercel serverless cannot host that, so we need a small separate host (for example Fly.io or Railway) for the call brain. Decision needed from user before Milestone 4.
Other gaps: no calendar tool in Vaani except a Cal.com integration (brief says Google Calendar, so booking also runs in our BYOL server). Vaani docs say nothing on how inbound webhook ties to the caller number beyond `phone_number` in some events: verify with a real call.
- All Vaani calls go behind an adapter interface with a mock for tests. No real calls in automated tests.

## Decisions from user (2026-10-07)
- 4 placeholder designers, test Google Calendars. Slot config: 45 min, 10am to 7pm, Mon to Sat (in `.env.example`).
- HubSpot: pipeline "Aangan Enquiries"; stages Qualified lead, Consultation booked, Proposal, Won, Lost; custom properties project_type, area_sq_ft, location, needed_by, client_size, internal_estimate, handoff_notes. Placeholders, renameable.
- Rubric approver: Nikhil. Approval step stays on.
- Database: Supabase.
- Pricing deflection before qualification ends: approved as default. Still flagged for Nikhil.

## Items to confirm with Nikhil
1. Pricing deflection ends by offering a booking, but booking is only for qualified leads. Default: say the deflection text, keep asking questions ("Let me ask you a couple of quick things first"), offer booking only after `qualified`.
2. `qualified.md` conflict: intro says "fails one, close gracefully"; boundaries say "two or more fail: decline". Default (config flag `QUALIFY_FAIL_POLICY=any_clear_fail`): any clear fail on criteria 1, 2, 3 or clear budget mismatch = unqualified. Unclear 4 or 5 = qualified with note.
3. Timeline conflict: `qualified.md` says 8 to 10 weeks; `services.md` says 6 week minimum. Default (flags `TIMELINE_FAIL_UNDER_WEEKS=6`, `TIMELINE_PASS_FROM_WEEKS=10`): under 6 = fail; 6 to 10 = unclear, ask one question; 10+ = pass.
4. Rubric learning loop: approval step stays on (user decision). Nikhil approves.

## Milestone 4: post-call pipeline (2026-10-10). Route NOT built yet, waiting on the webhook auth decision.
- Built (all tested, `npm test` = 114 pass; live evals pass): `src/lib/postcall/` (payload parsing, transcript parsing, price detector, Gemini extraction prompt `prompts/extract_call.v1.md`, Neon store, HubSpot adapter, `processCall`/`handleVaaniEvent`), `db/migrations/0002_postcall.sql` (applied to Neon: `calls.price_spoken`, `calls.booking_before_qualified`, `summary`, `entities`, `flags`, `recording_url`; `review_queue.kind`; `webhook_events` inbox). Real Neon round trip checked with `npm run db:check`.
- Flow: raw body stored first (`webhook_events`) -> classify transcript (same rule engine, final round) -> price check (pattern check on agent turns + Gemini reading, either one sets `price_spoken`) -> booking check -> one transaction writes call, lead, review entry -> HubSpot deal only for qualified calls. Repeating the same call id changes nothing, except retrying a HubSpot deal that failed.
- Review list gets a row with `kind='compliance'` for: price spoken, booking before details were complete, booking when the classifier does not qualify, agent declined a caller who qualifies. Unqualified calls keep `kind='unqualified'`. Failed calls (no caller speech, caller not understood, Gemini down) go on the callback list (`callback_due_at` = call end + 60 min).
- Live eval on 9 realistic transcripts (`npm run eval:postcall`, `docs/eval/postcall-latest.md`): 9/9 PASS, including a Hinglish price hint that only Gemini caught. A transcript you paste can be checked with `npm run check:transcript -- file.txt`.
- Decision made while building: after the call nobody can ask a question. If the agent already took the caller forward (asked for an email or booked) and the transcript leaves criteria 1 to 3 unclear, the lead stays qualified with a note; otherwise the configured policy applies (default unqualified). Without this, a call where the caller said "redo my flat fully" but did not say "execution" cancelled a booked lead (found by the eval).
- Webhook auth finding: see "Webhook auth" below.
- Caller number: the documented `call_postprocessing` payload has no caller number for inbound calls. We read `phone_number`, `contact_number`, `caller_number` or entities if present, else the phone is taken from what the caller says in the transcript. Verify with a real call.
- `response_seconds` is stored as 0 when the agent greeted (Vaani answers at once); ring-to-answer time is not in the payload.
- HubSpot: adapter built against the CRM v3 API (not yet run against a real portal). Needs `HUBSPOT_ACCESS_TOKEN` (private app, scopes crm.objects.contacts.write and crm.objects.deals.write) and the pipeline "Aangan Enquiries" with stages Qualified lead, Consultation booked, Proposal, Won, Lost, and deal properties project_type, area_sq_ft, location, needed_by, client_size, internal_estimate, handoff_notes. The HubSpot connector can create those once the user approves the table shown in chat.

### Webhook auth (Vaani docs, read 2026-10-10)
- `docs.vaanivoice.ai/guides/webhook-setup` (events incl. `call_postprocessing`, set in Settings, Webhooks): NO signature, secret or header auth is documented.
- HMAC-SHA256 signing (`X-Vaani-Signature: sha256=...`, `X-Vaani-Timestamp`, signed string `timestamp.body`, 5 minute replay window) is documented only on the CAMPAIGN webhooks page, with different event names (`call.completed`) and a different API host (`api.vaani.ai`). Not confirmed to apply to dashboard webhooks.
- Options for the route (user to choose): (A) check Settings, Webhooks for a signing secret field; (B) treat the webhook as a notification only: take the call id, fetch the call from Vaani with our API key (`Get Call Details`), and process what Vaani returns, so a forged call id changes nothing; (C) secret token inside the registered URL. B can be combined with A or C.

## Vaani web tests
- Test plan with exact lines and what to report: `docs/web-test-plan.md`. Agent prompt now names the Cal.com tools (Check_availability_booking, book_appointment; cancel_appointment and reschedule_appointment only on request), locks them until the lead is a fit, and ends with a price self-check. Live agent updated and verified identical to the repo prompt.
- Language: agent is `en` + `auto_detect: true`. No persona field exists for a secondary language (only web sessions started through the API take `secondary_language`). Hindi recognition is untested. If Hindi fails, the next try is the STT language value for multilingual mode; not changed without a test. The dashboard web test may itself start with Hindi primary (its code does for its own sessions): note the language it greets in. Marathi: UNVERIFIED, no claim.

## Vaani native agent (2026-10-10, stack-only plan confirmed by user)
- Built: `src/lib/vaani/client.ts` (REST adapter + `MockVaaniClient`), `src/lib/vaani/agent-prompt.ts` (agent prompt from the live knowledge files, thresholds from config, rate tables withheld, no braces), `scripts/sync-vaani-agent.ts` (`npm run vaani:sync`, `-- --dry-run` writes `docs/vaani-agent-prompt.md` only). 14 new tests, `npm test` = 87 pass.
- DONE 2026-10-10: new API key worked (the old one had been revoked). Agent CREATED: `Aangan Studio enquiry agent`, id `75db4b29-814b-4a4a-9d49-1b456654916f` (saved as `VAANI_AGENT_ID` in `.env.local`). Verified by reading it back (`GET /api/agent/{id}`, works though undocumented): stored system prompt is identical to ours (10,360 chars), greeting set, `language: en`, `auto_detect: true`. Not published, no phone number, `persona.actions.functions` is empty (Cal.com booking tool NOT attached yet).
- Vaani defaults picked for the agent: STT Deepgram nova-3 with language `en`, LLM Google gemini-3.5-flash (temperature 0.7, max_tokens 500), TTS Cartesia voice "devansh". Hindi and Marathi callers need STT and voice changed (open item, test with a real call).
- Dashboard: Integrations already lists Cal.com with 4 tools (which key it uses is unknown). Tools & Actions "New Action" offers "Create Custom Tools/Actions" described in natural language. Not yet seen: whether a custom action can call a URL.
- (Old blocker, resolved) creating the agent returned `401 Invalid API key`. The same key returned 200 on `GET /api/agents` earlier today, and now every endpoint returns 401, so the key was revoked or rotated. Need a fresh key (Vaani dashboard, Settings, API Keys) put into `.env.local` as `VAANI_API_KEY`. No agent was created. Then run `npm run vaani:sync`; it saves `VAANI_AGENT_ID` to `.env.local`.
- After any change to `knowledge/*.md`, re-run `npm run vaani:sync` (native agents cannot load files per call).

## Vaani dashboard findings (screenshots, 2026-10-10)
- Sidebar: Agents, Knowledge Base, Tools & Actions, Voice Lab, Telephony, Integrations, Templates, Automations. Agent list is empty.
- Tools & Actions has 5 built-in system tools: Hold Call, Transfer Call, Schedule Callback, Agent Transfer, Entities Extraction. There is a "New Action" button (custom actions: not yet seen, may allow an API or webhook call mid-call). Still to see: the New Action form, Integrations (Cal.com) and Knowledge Base pages.
- Schedule Callback may serve the failed-call path. Entities Extraction may capture name, phone, email during the call.

## Cal.com (2026-10-10)
- `CALCOM_API_KEY` saved in `.env.local` (gitignored). Verified read-only: `GET https://api.cal.com/v2/me` returns 200 (Bearer auth), account timezone Asia/Kolkata, one user. Event types found: 30min, 15min, secret (15). No 45-minute type yet.
- DECIDED (user, 2026-10-10): one calendar for now, new 45-minute event type. DONE: event type `aangan-consultation` (id 7422070, 45 min) on its own schedule "Aangan consultation hours" (id 2480201): Mon to Sat 10:00 to 19:00 Asia/Kolkata, minimum notice 120 min, from config. Your default Cal.com schedule (Mon to Fri 9 to 5) is untouched. Verified: `/v2/slots` returns 45-minute slots on those days, none on Sunday. Re-run `npm run calcom:setup` after changing booking config. All bookings land on one calendar (designers are not separated yet).
- Brief says Google Calendar, Cal.com only if asked. Decision pending: is Cal.com now the booking tool? One Cal.com user = one calendar, but the brief has 4 designers with separate calendars (needs a Cal.com team with round-robin, or 4 accounts/keys). Vaani also has a native Cal.com integration, but with BYOL our own server would book through the API.

## Milestones
1 Foundation [x] · 2 Knowledge loader [x] · 3 Classification [x] · 4 Vaani integration [x built, webhook registration and Cal.com tool attach pending (user)] · 5 Booking [x via Vaani Cal.com tools plus post-call lookup] · 6 Post-call [x, HubSpot and Resend need credentials] · 7 Dashboards [x] · 8 Fallback and metrics [x] · 9 Nikhil summary and rubric loop [x] · 10 End to end [x]

## Missing inputs
- `/enquiries/` folder (40 anonymised transcripts). User will add later. Replay test skipped.
- Vaani docs link.
- GitHub remote URL.
- Supabase project (URL and keys), Gemini key, Resend key, HubSpot token, Google service account. Needed from Milestone 3 onward for live runs. Mocks cover tests.
