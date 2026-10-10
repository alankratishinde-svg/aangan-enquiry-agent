# End to end, 2026-10-10

**14/14 PASS.** Real webhook handler, live Gemini, in-process Postgres with our migrations, mock Vaani/Cal.com/Resend/HubSpot.

| Scenario | Status | price_spoken | booking flag | Result |
|---|---|---|---|---|
| 1. Qualified call | qualified | false | false | PASS |
| 2. Unqualified call (Talegaon) | unqualified | false | false | PASS |
| 3. Failed call (caller never spoke) | failed | false | false | PASS |
| 4a. Price question, approved deflection | qualified | false | false | PASS |
| 4b. Price question, agent names a price | qualified | true | false | PASS |

- PASS: Designers see the qualified leads (3 qualified calls) 3 leads
- PASS: Every lead card has exactly 2 add-on tips 
- PASS: Every estimate carries its internal label, or says See pricing.md 
- PASS: Designer emails sent, one per qualified lead 3 emails
- PASS: No email ever mentions a price except the labelled estimate 
- PASS: HubSpot deals only for qualified calls 3 deals
- PASS: Front desk list has the unqualified lead and the price flag 2 items
- PASS: Callback list has the failed call, due in one hour 1 open
- PASS: Weekly counts match {"qualified":3,"unqualified":1,"failed":1,"total":5}
