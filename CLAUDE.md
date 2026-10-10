# Aangan Studio phone-enquiry agent: project rules

Pune interior design studio (14 designers, 2 front desk). Scope: phone calls only. Keep code channel-agnostic so WhatsApp or web form can later feed the same `classify_lead` and storage.

## Working rules
- Read `/knowledge/*.md` before changing agent behaviour. They are the source of truth.
- Update `PROGRESS.md` and commit at the end of every working session.
- Never guess external APIs (Vaani Labs, Supabase/Neon, Resend, HubSpot, Google Calendar, Gemini). Read official docs. If a needed capability is unsupported, stop and tell the user in plain language. Never invent endpoints or parameters.
- Secrets only in `.env.local`. Commit `.env.example` only.
- Ask the user before deviating from the stack or the hard rules.
- Build in milestones. Run acceptance tests after each and show results.

## Knowledge files
- At the start of every call the backend loads the CURRENT contents of `knowledge/services.md`, `pricing.md`, `qualified.md` and builds the agent instructions from them. Never hardcode their content in code or prompts.
- `pricing.md` is internal.

## Hard rules (non-negotiable)
1. The agent never says any price to a caller. No number, range, per-sq-ft figure, "around", "starts at". On a price question, say the exact deflection text from the section "The only acceptable response to a pricing question" in `pricing.md`, read at runtime. Price question does NOT disqualify. Booking is offered only after verdict `qualified`. Unqualified leads get the graceful close from `qualified.md`, no booking offer. (Open: confirm with Nikhil. See PROGRESS.md.)
2. Internal estimate for designers only. Computed after the call from `pricing.md` figures parsed at runtime. Label: "Internal, indicative only, not for the client". Never spoken, never sent to caller. Parse failure shows "See pricing.md". Never hardcode rupee values.
3. One call, one session. All context (three knowledge files + free designer slots) loaded before the first word. No hang-up and call back, no mid-call lookup needing a second call.
4. No promises: no discounts, start dates, unconfirmable designer names, or outcomes. Be honest when a project is not a fit.
5. Qualification is advisory and reversible. Never auto-delete unqualified leads. They go to the front desk review queue (delete or convert).
6. Never invent facts about Aangan. If the files do not answer, say the designer will cover it at the consultation.

## Stack (hard rule: ONLY these tools; do not suggest Fly.io, Railway, BYOL or any other host)
Vaani Labs (voice, telephony, orchestration) · Gemini Flash (classify, summaries, tips, weekly summary, rubric drafts) · Google Calendar (slots, booking) · Resend (designer email) · Neon Postgres (source of truth; moved from Supabase on 2026-10-10) · Next.js on Vercel (dashboards, API routes) · HubSpot (CRM for Nikhil) · Claude Code + GitHub.

## Qualification rule engine (code decides, not Gemini)
Gemini returns per-criterion status JSON. Code applies:
- Criteria 1, 2, 3 unclear: `ask_question` (one question, re-run once).
- Any of 1, 2, 3 clear fail, or criterion 4 clear fail: `unqualified`.
- Criterion 4 not mentioned: pass. Criteria 4 or 5 unclear: `qualified` + `handoff_notes`.
- Out-of-scope per `services.md`: `unqualified`. Borderline (~3,000 sq ft commercial): criterion 1 unclear, one question.
- Never disqualify for: not knowing what they want, after-hours, price question, style/material uncertainty, single room, rented apartment without structural change.
- Config flags (see PROGRESS.md): fail-one-vs-fail-two policy; timeline thresholds (under 6 weeks = fail, 6 to 10 = unclear, 10+ = pass).

## Failure handling
Dropped call, not understood, or tool failure: `calls.status = 'failed'`, store reason, add to front desk callback list with 1-hour target. Track `response_seconds` (target under 300).
