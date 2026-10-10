# PROGRESS

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

## Vaani native agent (2026-10-10, stack-only plan confirmed by user)
- Built: `src/lib/vaani/client.ts` (REST adapter + `MockVaaniClient`), `src/lib/vaani/agent-prompt.ts` (agent prompt from the live knowledge files, thresholds from config, rate tables withheld, no braces), `scripts/sync-vaani-agent.ts` (`npm run vaani:sync`, `-- --dry-run` writes `docs/vaani-agent-prompt.md` only). 14 new tests, `npm test` = 87 pass.
- BLOCKED: creating the agent returned `401 Invalid API key`. The same key returned 200 on `GET /api/agents` earlier today, and now every endpoint returns 401, so the key was revoked or rotated. Need a fresh key (Vaani dashboard, Settings, API Keys) put into `.env.local` as `VAANI_API_KEY`. No agent was created. Then run `npm run vaani:sync`; it saves `VAANI_AGENT_ID` to `.env.local`.
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
1. Foundation [x]
2. Context bundle and knowledge loader [ ]
3. Classification (`classify_lead`, Gemini prompt a, rule engine, 14 test cases) [ ]
4. Vaani integration (adapter + mock + real verification) [ ]
5. Booking [ ]
6. Post-call (webhook, Resend, HubSpot) [ ]
7. Dashboards [ ]
8. Fallback and metrics [ ]
9. Nikhil summary and rubric loop [ ]
10. End-to-end [ ]

## Missing inputs
- `/enquiries/` folder (40 anonymised transcripts). User will add later. Replay test skipped.
- Vaani docs link.
- GitHub remote URL.
- Supabase project (URL and keys), Gemini key, Resend key, HubSpot token, Google service account. Needed from Milestone 3 onward for live runs. Mocks cover tests.
