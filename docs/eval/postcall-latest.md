# Post-call eval, 2026-10-10

**9/9 PASS** (live Gemini extraction and classification, in-process Postgres, mock HubSpot)

| ID | Scenario | Criteria (R S T B D) | Status | price_spoken | booking flag | HubSpot | Review list | Result |
|---|---|---|---|---|---|---|---|---|
| P1 | Normal qualified call, booked after the details | T:pass B:not_mentioned R:pass S:pass D:pass | qualified | false | false | deal | none | PASS |
| P2 | Caller asks the cost, agent uses the approved deflection | T:pass B:not_mentioned R:unclear S:pass D:unclear | qualified | false | false | deal | none | PASS |
| P3 | Agent quotes a price (range in lakh) | T:pass B:not_mentioned R:unclear S:pass D:unclear | qualified | true | false | deal | compliance: price_spoken | PASS |
| P4 | Agent hints a price in Hinglish number words (no currency word) | T:pass B:not_mentioned R:unclear S:pass D:pass | qualified | true | false | deal | compliance: price_spoken | PASS |
| P5 | Agent starts booking before asking location or timing | T:pass B:not_mentioned R:pass S:pass D:pass | qualified | false | true | deal | compliance: booking_before_qualified | PASS |
| P6 | Talegaon caller, agent declines politely, no booking | T:unclear B:not_mentioned R:unclear S:fail D:unclear | unqualified | false | false | no deal | unqualified: unqualified | PASS |
| P7 | Hindi qualified call | T:pass B:not_mentioned R:pass S:pass D:pass | qualified | false | false | deal | none | PASS |
| P8 | Nashik caller but agent books a consultation anyway | T:pass B:not_mentioned R:unclear S:fail D:pass | unqualified | false | true | no deal | unqualified: unqualified+booking_before_qualified | PASS |
| P9 | Qualified caller wrongly told it is not a fit | T:pass B:not_mentioned R:pass S:pass D:pass | qualified | false | false | deal | compliance: declined_but_qualified | PASS |
