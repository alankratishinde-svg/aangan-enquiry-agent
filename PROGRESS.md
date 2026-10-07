# PROGRESS

## Status (2026-10-07)
- Milestone 1 (Foundation): DONE. Acceptance test passed: migrations apply cleanly (8 tests, `npm test`).
- Next: Milestone 2 (context bundle and knowledge loader), but first verify Vaani capabilities (see below).
- GitHub: private repo https://github.com/alankratishinde-svg/aangan-enquiry-agent (pushed).
- `.env.local` created (gitignored) with Vaani key, plus Gemini key and Supabase URL/service key copied from the Two Tickets project at user request.
- WARNING: that Supabase project (nygjjubcosuregacjacm) is the live Two Tickets database. Migration NOT applied. Recommend a separate Supabase project for Aangan (customer phone numbers and transcripts). User decision pending.

## Milestone 1 delivered
- `knowledge/` (services, pricing, qualified), `CLAUDE.md`, `PROGRESS.md`, `.gitignore` (covers `.env.local`), `.env.example`.
- `supabase/migrations/20261007000000_init.sql`: 8 tables from the brief, RLS on all, indexes.
- `supabase/seed.sql`: 4 placeholder designers with test calendar IDs.
- `tests/migrations.test.ts`: runs migrations plus seed on real Postgres (PGlite, in-process, no cloud). Checks tables, RLS enabled, constraints, designer-only-sees-own-leads, calls hidden from `authenticated`.
- `tests/enquiries-replay.test.ts`: skipped placeholder until `/enquiries/` arrives.

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
