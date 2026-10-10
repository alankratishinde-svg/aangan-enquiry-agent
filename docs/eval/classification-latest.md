# Classification eval, 2026-10-10

Model: gemini-flash-latest. Config: {"failPolicy":"any_clear_fail","timeline":[6,10],"commercialMaxSqFt":3000,"unclearAfterRetry":"unqualified"}

**42/42 PASS**

| ID | Scenario | Gemini criteria (R=real project S=service area T=timeline B=budget D=decision-maker; `→x*` = rule engine override) | Rule engine verdict | Expected | Result |
|---|---|---|---|---|---|
| B1a | Caller in Talegaon | R:pass S:FAIL T:pass B:n/m D:pass | unqualified | unqualified (service_area) | PASS |
| B1b | Caller in Nashik | R:pass S:FAIL T:pass B:n/m D:pass | unqualified | unqualified (service_area) | PASS |
| B2a | "I just want some ideas" | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| B2b | "I'll do the execution myself" | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| B3 | Needs it done in 3 weeks | R:pass S:pass T:FAIL B:n/m D:pass | unqualified | unqualified (timeline) | PASS |
| B4 | Needs it in 8 weeks → ...caller says the date can move | R:pass S:pass T:pass→unclear* B:n/m D:pass ⟶ R:pass S:pass T:pass B:n/m D:pass | ask_question (timeline) ⟶ qualified | ask_question (timeline) ⟶ qualified | PASS |
| B5 | Full flat, volunteers a very low budget | R:pass S:pass T:pass B:FAIL D:pass | unqualified | unqualified (budget_band) | PASS |
| B6 | Budget not mentioned | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| B7 | Spouse wants it, unavailable, caller authorised | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| B8 | "Initial research for my in-laws" | R:pass S:pass T:pass B:n/m D:unclear | qualified | qualified | PASS |
| B9a | Restaurant fitout | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| B9b | Hotel interiors | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| B9c | Retail store | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| B9d | Gym fitout | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| B10 | Office of about 3,500 sq ft | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| B11 | Single room with full execution | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| B12 | Rented apartment, no structural changes | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| B13 | After-hours call | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| B14 | Caller asks "how much will it cost?" | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| E1 | Structural work (knock down walls) | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| E2 | Decor and styling only | R:FAIL S:pass T:pass→unclear* B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| E3 | Standalone furniture sourcing | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| E4 | Standalone Vastu advice | R:FAIL S:pass T:pass B:n/m D:pass | unqualified | unqualified (real_project) | PASS |
| E5 | Office 3,100 sq ft (just over the limit) → ...caller confirms carpet area 2,900 | R:pass→unclear* S:pass T:pass B:n/m D:pass ⟶ R:pass S:pass T:pass B:n/m D:pass | ask_question (real_project) ⟶ qualified | ask_question (real_project) ⟶ qualified | PASS |
| E6 | Office 3,000 sq ft (at the limit) | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| E7 | Office 2,000 sq ft | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| E8 | Clinic 1,200 sq ft | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| E9 | Timeline: 5 weeks (under 6) | R:pass S:pass T:FAIL B:n/m D:pass | unqualified | unqualified (timeline) | PASS |
| E10 | Timeline: 6 weeks (edge of band) | R:pass S:pass T:FAIL→unclear* B:n/m D:pass | ask_question (timeline) | ask_question (timeline) | PASS |
| E11 | Timeline: 9 weeks | R:pass S:pass T:pass→unclear* B:n/m D:pass | ask_question (timeline) | ask_question (timeline) | PASS |
| E12 | Timeline: 10 weeks | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| E13 | Timeline: 12 weeks | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| E14 | 8 weeks, caller says the date is fixed → ...caller says it is fixed | R:pass S:pass T:pass→unclear* B:n/m D:pass ⟶ R:pass S:pass T:FAIL B:n/m D:pass | ask_question (timeline) ⟶ unqualified | ask_question (timeline) ⟶ unqualified (timeline) | PASS |
| E15 | No location given → ...caller says Kothrud | R:pass S:unclear T:pass B:n/m D:pass ⟶ R:pass S:pass T:pass B:n/m D:pass | ask_question (service_area) ⟶ qualified | ask_question (service_area) ⟶ qualified | PASS |
| E16 | Lonavala | R:pass S:FAIL T:pass B:n/m D:pass | unqualified | unqualified (service_area) | PASS |
| E17 | Mumbai | R:pass S:FAIL T:pass B:n/m D:pass | unqualified | unqualified (service_area) | PASS |
| E18 | Hinjewadi (PCMC list) | R:pass S:pass T:pass B:n/m D:pass | qualified | qualified | PASS |
| E19 | No timing at all → ...caller says in 6 months | R:pass S:pass T:unclear B:n/m D:pass ⟶ R:pass S:pass T:pass B:n/m D:pass | ask_question (timeline) ⟶ qualified | ask_question (timeline) ⟶ qualified | PASS |
| E20 | Unsure whether they want execution → ...caller wants full design and execution | R:unclear S:pass T:pass B:n/m D:pass ⟶ R:pass S:pass T:pass B:n/m D:pass | ask_question (real_project) ⟶ qualified | ask_question (real_project) ⟶ qualified | PASS |
| E21 | Two unclear at once (location and timing) → ...caller answers both | R:pass S:unclear T:unclear B:n/m D:pass ⟶ R:pass S:pass T:pass B:n/m D:pass | ask_question (service_area+timeline) ⟶ qualified | ask_question ⟶ qualified | PASS |
| E22 | Still unclear after the one question → ...caller still will not say | R:pass S:unclear T:pass B:n/m D:pass ⟶ R:pass S:unclear T:pass B:n/m D:pass | ask_question (service_area) ⟶ unqualified | ask_question (service_area) ⟶ unqualified | PASS |
| E23 | Large budget that fits the scope | R:pass S:pass T:pass B:pass D:pass | qualified | qualified | PASS |

## Details

### B1a: Caller in Talegaon
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Redo my 3BHK flat completely","bhk":3,"location_text":"Talegaon Dabhade","needed_by_text":"in about 5 months","weeks_until_needed":20}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: pass: Caller wants full design and execution for a 3BHK flat.
- service_area: fail: Site is in Talegaon Dabhade, which is outside our service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller confirmed they are making the decision themselves.
- decline_reason: We currently only take on projects within Pune city and PCMC, so we are unable to take on work in Talegaon.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Project located outside service area in Talegaon Dabhade.
- PASS

### B1b: Caller in Nashik
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full interiors for my new house","location_text":"Nashik","needed_by_text":"within 6 months","weeks_until_needed":24}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: pass: Caller wants full interior design and execution for their new home.
- service_area: fail: Project site is located in Nashik, which is outside the Pune and PCMC service area.
- timeline: pass: Needed in 24 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: The caller is deciding for themselves.
- decline_reason: We currently only take on projects within Pune and PCMC, so we are unable to take on work in Nashik.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Project located in Nashik, which is outside the active service area.
- PASS

### B2a: "I just want some ideas"
- answers: `{"project_type":"unknown","wants_design_and_execution":"no","project_description":"I just want some ideas for my living room, nothing more","location_text":"Kothrud","needed_by_text":"no rush","weeks_until_needed":26,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: Caller only wants ideas for the living room and explicitly does not want execution.
- service_area: pass: Project location is Kothrud, which is within Pune city.
- timeline: pass: Needed in 26 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller confirms they are the decision maker.
- decline_reason: We specialize in complete design and execution projects rather than standalone ideas or consultation.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller is looking only for living room ideas without execution.
- PASS

### B2b: "I'll do the execution myself"
- answers: `{"project_type":"single_room","wants_design_and_execution":"no","project_description":"I only need a design. I'll do the execution myself with my own contractor","location_text":"Baner","needed_by_text":"in 4 months","weeks_until_needed":17,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: Caller stated they only want design and will handle execution themselves with their own contractor.
- service_area: pass: Location is Baner, which is within Pune city.
- timeline: pass: Needed in 17 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller is the decision-maker.
- decline_reason: We offer complete design and execution together and do not take on design-only projects.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller plans to use their own contractor for execution.
- PASS

### B3: Needs it done in 3 weeks
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"2BHK full redesign","bhk":2,"location_text":"Wakad","needed_by_text":"in 3 weeks, we move in then","weeks_until_needed":3}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: pass: Caller wants a complete 2BHK redesign with full execution.
- service_area: pass: The project site is in Wakad, which is within the service area.
- timeline: fail: Needed in 3 weeks. Execution cannot begin when the project must be ready in under 6 weeks.
- budget_band: not_mentioned: Budget was not mentioned by the caller.
- decision_maker: pass: The caller is the decision maker.
- decline_reason: We cannot take on a full redesign on a three-week timeline as our minimum lead time requires more time to deliver quality execution.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller requested completion within three weeks for a move-in.
- PASS

### B4.1: Needs it in 8 weeks
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"2BHK full redesign","bhk":2,"location_text":"Aundh","needed_by_text":"in about 8 weeks","weeks_until_needed":8}`
- verdict: **ask_question** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full design and execution for a 2BHK redesign.
- service_area: pass: The project location is Aundh, which is within the Pune service area.
- timeline: pass → unclear (rule): Needed in about 8 weeks. Between 6 and 10 weeks needs one question.
- budget_band: not_mentioned: Caller did not mention any budget figures.
- decision_maker: pass: The caller confirmed they are the primary decision maker.
- questions: [timeline] Is that finish date fixed, or could it be a little later if needed?
- handoff_notes: Full 2BHK redesign in Aundh requiring completion in approximately eight weeks.
- PASS

### B4.2: ...caller says the date can move
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"2BHK full redesign","bhk":2,"location_text":"Aundh","needed_by_text":"in about 8 weeks, but we can be flexible","weeks_until_needed":8,"timeline_firm":false}`
- verdict: **qualified** (Gemini advised: qualified), round 2
- real_project: pass: Caller wants full design and execution for a 2BHK flat.
- service_area: pass: The project location is Aundh, which is within the Pune service area.
- timeline: pass: Needed in about 8 weeks, but the caller said the date can move.
- budget_band: not_mentioned: Caller did not mention a budget.
- decision_maker: pass: Caller confirmed they are the decision-maker.
- handoff_notes: Caller is looking for a full 2BHK redesign in Aundh with flexibility around their eight-week target.
- PASS

### B5: Full flat, volunteers a very low budget
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Complete redesign of my 3BHK flat","bhk":3,"area_sq_ft":1400,"location_text":"Viman Nagar","needed_by_text":"in 5 months","weeks_until_needed":20,"budget_volunteered_inr":120000,"budget_text":"my budget is about 1.2 lakh"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: pass: Caller wants complete redesign and execution of a full residential flat.
- service_area: pass: Location is in Viman Nagar, which is within the Pune service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: fail: Caller volunteered a budget that is far below what a full flat redesign requires.
- decision_maker: pass: Caller confirms they are the decision-maker.
- decline_reason: The scope of a complete flat redesign unfortunately does not align with the budget mentioned.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller volunteered a budget that is far below the scope described for a full home redesign.
- PASS

### B6: Budget not mentioned
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full home redesign, 3BHK","bhk":3,"location_text":"Hadapsar","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full home redesign and execution for a 3BHK.
- service_area: pass: The project is located in Hadapsar, which is within the service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: The caller confirmed they are the decision maker.
- handoff_notes: Project is a 3BHK full home redesign and execution in Hadapsar needed in 5 months.
- PASS

### B7: Spouse wants it, unavailable, caller authorised
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"authorised_on_behalf","project_description":"My spouse wants a full redesign but is travelling. I am authorised to go ahead.","bhk":2,"location_text":"Pimple Saudagar","needed_by_text":"in 4 months","weeks_until_needed":17}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full home design and execution for a 2BHK flat.
- service_area: pass: Project is located in Pimple Saudagar, which is within the PCMC service area.
- timeline: pass: Needed in 17 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller is authorised to move forward on behalf of their travelling spouse.
- handoff_notes: Caller is authorised to proceed on behalf of their spouse who is currently travelling.
- PASS

### B8: "Initial research for my in-laws"
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"researching_for_others","project_description":"I'm just doing initial research for my in-laws' flat redesign","bhk":2,"location_text":"Kothrud","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full home design and execution for a flat.
- service_area: pass: The project location is Kothrud, which is within the service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: unclear: Caller is doing initial research on behalf of in-laws.
- handoff_notes: Caller is doing initial research for in-laws' flat redesign. | Decision-maker unclear: Caller is doing initial research on behalf of in-laws.
- PASS

### B9a: Restaurant fitout
- answers: `{"project_type":"other","wants_design_and_execution":"yes","project_description":"I'm opening a restaurant and need the full interior fitout","area_sq_ft":1500,"location_text":"Koregaon Park","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: The caller wants an interior fitout for a restaurant, which is explicitly out of scope.
- service_area: pass: Koregaon Park is within Pune city service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: The caller did not state a budget.
- decision_maker: pass: The caller is making the decisions directly.
- decline_reason: We do not take on restaurant or hospitality projects as part of our interior design services.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller requested a full fitout for a restaurant project.
- PASS

### B9b: Hotel interiors
- answers: `{"project_type":"other","wants_design_and_execution":"yes","project_description":"Interiors for a 20 room boutique hotel","location_text":"Deccan","needed_by_text":"in 6 months","weeks_until_needed":26,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: Caller is requesting interior design for a boutique hotel, which is hospitality and explicitly out of scope.
- service_area: pass: Deccan is within the Pune service area.
- timeline: pass: Needed in 26 weeks or more.
- budget_band: not_mentioned: Caller did not mention a budget.
- decision_maker: pass: Caller is the decision-maker.
- decline_reason: We do not take on hotel or hospitality projects as part of our services.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller requested interiors for a 20-room boutique hotel in Deccan.
- PASS

### B9c: Retail store
- answers: `{"project_type":"other","wants_design_and_execution":"yes","project_description":"Interior design for my clothing retail store","area_sq_ft":900,"location_text":"Aundh","needed_by_text":"in 4 months","weeks_until_needed":17,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: The caller is asking for interior design for a clothing retail store, which is explicitly out of scope.
- service_area: pass: The project is located in Aundh, which is within the Pune service area.
- timeline: pass: Needed in 17 weeks or more.
- budget_band: not_mentioned: The caller did not state a budget.
- decision_maker: pass: The caller confirmed they are the decision-maker.
- decline_reason: We do not take on retail store projects as part of our interior design services.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller requested design and execution for a 900 sq ft clothing retail store in Aundh.
- PASS

### B9d: Gym fitout
- answers: `{"project_type":"other","wants_design_and_execution":"yes","project_description":"Full fitout for a new gym","area_sq_ft":2500,"location_text":"Baner","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: Caller wants a fitout for a gym, which is explicitly outside Aangan's scope of services.
- service_area: pass: The project location is Baner, which is within Pune city.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller did not mention a budget.
- decision_maker: pass: The caller confirmed they are the decision-maker.
- decline_reason: We do not take on gym projects as they fall outside our current scope of services.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller requested a fitout for a 2,500 sq ft gym in Baner.
- PASS

### B10: Office of about 3,500 sq ft
- answers: `{"project_type":"office","wants_design_and_execution":"yes","project_description":"Design and build our new office","area_sq_ft":3500,"location_text":"Hinjewadi","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: The commercial office size exceeds the studio's limit of approximately 3,000 sq ft.
- service_area: pass: Hinjewadi is within the PCMC service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Budget was not mentioned by the caller.
- decision_maker: pass: The caller confirmed they are the decision-maker.
- decline_reason: We specialize in commercial office spaces up to approximately 3,000 square feet, so this project exceeds our current scope.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Project scope is an office space exceeding the standard commercial size limit.
- PASS

### B11: Single room with full execution
- answers: `{"project_type":"single_room","wants_design_and_execution":"yes","project_description":"Complete redesign of my master bedroom with all materials and execution","location_text":"Kalyani Nagar","needed_by_text":"in 4 months","weeks_until_needed":17,"decision_maker":"self"}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants complete redesign of master bedroom with design and full execution.
- service_area: pass: Location is Kalyani Nagar, which is within Pune city.
- timeline: pass: Needed in 17 weeks or more.
- budget_band: not_mentioned: Caller did not mention a budget.
- decision_maker: pass: Caller confirmed they are deciding for themselves.
- handoff_notes: Project is a single master bedroom redesign with execution in Kalyani Nagar.
- PASS

### B12: Rented apartment, no structural changes
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","is_rented":true,"structural_changes":false,"project_description":"We rent our 2BHK and want it fully redone, no structural changes","bhk":2,"location_text":"Magarpatta","needed_by_text":"in 4 months","weeks_until_needed":17}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full design and execution for a rented 2BHK with no structural changes.
- service_area: pass: Magarpatta is explicitly listed in Aangan Studio's Pune service area.
- timeline: pass: Needed in 17 weeks or more.
- budget_band: not_mentioned: The caller did not state a budget.
- decision_maker: pass: The caller is the decision maker.
- handoff_notes: Project is a rented 2BHK with no structural modifications required.
- PASS

### B13: After-hours call
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","called_after_hours":true,"project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Ravet","needed_by_text":"in 4 months","weeks_until_needed":17}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full redesign and execution for their 2BHK flat.
- service_area: pass: Ravet is located within the PCMC service area.
- timeline: pass: Needed in 17 weeks or more.
- budget_band: not_mentioned: The caller did not state a budget.
- decision_maker: pass: The caller confirmed they are making the decision themselves.
- handoff_notes: Caller is looking for a full redesign and execution of a 2BHK in Ravet with a 4-month timeline.
- PASS

### B14: Caller asks "how much will it cost?"
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","asked_about_price":true,"project_description":"Full redesign of my 3BHK. How much will it cost?","bhk":3,"location_text":"Baner","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full design and execution for a 3BHK flat.
- service_area: pass: Baner is located within the studio's primary service area in Pune.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller inquired about cost but did not state a budget figure.
- decision_maker: pass: Caller confirmed they are the decision-maker.
- handoff_notes: Caller asked about pricing during the call.
- PASS

### E1: Structural work (knock down walls)
- answers: `{"project_type":"other","wants_design_and_execution":"unclear","project_description":"I want to knock down the wall between my kitchen and hall and redo the structure, I need an architect","location_text":"Kothrud","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: Caller is seeking structural modifications, knocking down walls, and architectural work, which Aangan Studio does not provide.
- service_area: pass: The project location is Kothrud, which is within Pune city.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: The caller is deciding for themselves.
- decline_reason: We specialize in interior design and execution rather than structural architectural work like knocking down walls.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller is looking for an architect to carry out structural wall removal between kitchen and hall.
- PASS

### E2: Decor and styling only
- answers: `{"project_type":"other","wants_design_and_execution":"no","project_description":"Just advise me on colours and how to rearrange my furniture","location_text":"Baner","needed_by_text":"next month","weeks_until_needed":8,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: Caller only wants colour advice and furniture rearranging without execution.
- service_area: pass: The location is Baner, which is within the Pune service area.
- timeline: pass → unclear (rule): Needed in about 8 weeks. Between 6 and 10 weeks needs one question.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller is deciding for themselves.
- decline_reason: We specialize in complete design and execution projects and do not offer standalone styling or colour advisory services.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller requested decor and furniture rearrangement advice only.
- PASS

### E3: Standalone furniture sourcing
- answers: `{"project_type":"other","wants_design_and_execution":"no","project_description":"I only want you to source a sofa and dining table for me, no design work","location_text":"Aundh","needed_by_text":"in 3 months","weeks_until_needed":13,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: Caller only wants furniture sourcing and explicitly does not want design work.
- service_area: pass: Aundh is within Pune city service area.
- timeline: pass: Needed in 13 weeks or more.
- budget_band: not_mentioned: Caller did not mention a budget.
- decision_maker: pass: Caller is the decision maker.
- decline_reason: We do not offer standalone furniture sourcing without an associated design and execution project.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller requested furniture sourcing only for a sofa and dining table with no design work.
- PASS

### E4: Standalone Vastu advice
- answers: `{"project_type":"other","wants_design_and_execution":"no","project_description":"I only want a Vastu consultation for my flat","location_text":"Wakad","needed_by_text":"whenever","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: fail: Caller is seeking only standalone Vastu consultation without design and execution.
- service_area: pass: The site is located in Wakad, which is within the service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller did not mention a budget.
- decision_maker: pass: The caller is the sole decision maker.
- decline_reason: We do not offer standalone Vastu consultation services, as our work is focused on complete design and execution projects.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller only requested a Vastu consultation for their flat.
- PASS

### E5.1: Office 3,100 sq ft (just over the limit)
- answers: `{"project_type":"office","wants_design_and_execution":"yes","project_description":"Design and build our new office","area_sq_ft":3100,"location_text":"Baner","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **ask_question** (Gemini advised: qualified), round 1
- real_project: pass → unclear (rule): Commercial space is slightly above the roughly 3000 sq ft limit.
- service_area: pass: The project location is Baner, which is within the Pune service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: The caller is the decision maker.
- questions: [real_project] Could you confirm the carpet area of the space, in square feet?
- handoff_notes: Commercial office design and build project in Baner with a 5-month timeline.
- PASS

### E5.2: ...caller confirms carpet area 2,900
- answers: `{"project_type":"office","wants_design_and_execution":"yes","project_description":"Design and build our new office","area_sq_ft":2900,"location_text":"Baner","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **qualified** (Gemini advised: qualified), round 2
- real_project: pass: Caller wants full design and execution for a new office within the permissible size limit.
- service_area: pass: The project location is Baner, which is within the Pune service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller did not mention a budget.
- decision_maker: pass: Caller confirmed they are the decision-maker.
- handoff_notes: Commercial office space of 2,900 sq ft requiring full design and build.
- PASS

### E6: Office 3,000 sq ft (at the limit)
- answers: `{"project_type":"office","wants_design_and_execution":"yes","project_description":"Design and build our new office","area_sq_ft":3000,"location_text":"Hinjewadi","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full design and build for a 3,000 sq ft office, which fits within the commercial scope.
- service_area: pass: The project location is Hinjewadi, which is covered under PCMC service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: The caller confirmed they are making the decision themselves.
- handoff_notes: Commercial office design and build project of approximately 3,000 sq ft in Hinjewadi. | Target completion is in 20 weeks.
- PASS

### E7: Office 2,000 sq ft
- answers: `{"project_type":"office","wants_design_and_execution":"yes","project_description":"Design and build our new office","area_sq_ft":2000,"location_text":"Viman Nagar","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants design and execution for a 2000 sq ft office, which is within the 3,000 sq ft limit.
- service_area: pass: The project location is Viman Nagar, which is within Pune city.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: Caller stated they are the decision-maker.
- handoff_notes: Project is a 2000 sq ft office in Viman Nagar needing full design and execution within 20 weeks.
- PASS

### E8: Clinic 1,200 sq ft
- answers: `{"project_type":"clinic","wants_design_and_execution":"yes","project_description":"Design and fitout of my dental clinic","area_sq_ft":1200,"location_text":"Kothrud","needed_by_text":"in 4 months","weeks_until_needed":17,"decision_maker":"self"}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full design and fitout of a 1200 sq ft dental clinic, which fits commercial scope.
- service_area: pass: The site is located in Kothrud, which is within the Pune service area.
- timeline: pass: Needed in 17 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: The caller confirmed they are the decision-maker.
- handoff_notes: Project is a 1200 sq ft dental clinic in Kothrud needing complete design and fitout within 4 months.
- PASS

### E9: Timeline: 5 weeks (under 6)
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Baner","needed_by_text":"in 5 weeks","weeks_until_needed":5}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: pass: Caller wants a full redesign with design and execution for a 2BHK.
- service_area: pass: Baner is located within the Pune service area.
- timeline: fail: Needed in 5 weeks. Execution cannot begin when the project must be ready in under 6 weeks.
- budget_band: not_mentioned: Caller did not mention a budget.
- decision_maker: pass: Caller is the decision maker.
- decline_reason: We cannot take on this project because our full design and execution process requires more lead time than five weeks.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Timeline is too tight for our execution process.
- PASS

### E10: Timeline: 6 weeks (edge of band)
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Baner","needed_by_text":"in 6 weeks","weeks_until_needed":6}`
- verdict: **ask_question** (Gemini advised: unqualified), round 1
- real_project: pass: Caller wants full redesign and execution for their 2BHK flat.
- service_area: pass: Baner is located within Pune city.
- timeline: fail → unclear (rule): Needed in about 6 weeks. Between 6 and 10 weeks needs one question.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: Caller confirms they are the decision-maker.
- questions: [timeline] Is that finish date fixed, or could it be a little later if needed?
- PASS

### E11: Timeline: 9 weeks
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Baner","needed_by_text":"in 9 weeks","weeks_until_needed":9}`
- verdict: **ask_question** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full redesign and execution for their 2BHK flat.
- service_area: pass: Baner is located within the studio's Pune service area.
- timeline: pass → unclear (rule): Needed in about 9 weeks. Between 6 and 10 weeks needs one question.
- budget_band: not_mentioned: The caller did not state a budget.
- decision_maker: pass: The caller confirmed they are making the decision directly.
- questions: [timeline] Is that finish date fixed, or could it be a little later if needed?
- handoff_notes: Full 2BHK redesign project located in Baner. | Caller is looking for completion within nine weeks.
- PASS

### E12: Timeline: 10 weeks
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Baner","needed_by_text":"in 10 weeks","weeks_until_needed":10}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full redesign and execution of a 2BHK home.
- service_area: pass: The project location is Baner, which is within Pune city.
- timeline: pass: Needed in 10 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller stated they are the sole decision-maker.
- handoff_notes: Full 2BHK interior redesign and execution in Baner needed in 10 weeks.
- PASS

### E13: Timeline: 12 weeks
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Baner","needed_by_text":"in 12 weeks","weeks_until_needed":12}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full interior design and execution for a 2BHK flat.
- service_area: pass: The site is located in Baner, which is within the Pune service area.
- timeline: pass: Needed in 12 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller confirmed they are making the decisions themselves.
- handoff_notes: Project is a full redesign and execution of a 2BHK in Baner. | Target completion is in 12 weeks.
- PASS

### E14.1: 8 weeks, caller says the date is fixed
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Baner","needed_by_text":"in 8 weeks","weeks_until_needed":8}`
- verdict: **ask_question** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full design and execution for a 2BHK flat.
- service_area: pass: Baner is within Pune city and covered by the service area.
- timeline: pass → unclear (rule): Needed in about 8 weeks. Between 6 and 10 weeks needs one question.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: Caller confirmed they are making the decisions themselves.
- questions: [timeline] Is that finish date fixed, or could it be a little later if needed?
- handoff_notes: Project is a full 2BHK redesign in Baner needed in eight weeks.
- PASS

### E14.2: ...caller says it is fixed
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Baner","needed_by_text":"in 8 weeks, fixed, we move in then","weeks_until_needed":8,"timeline_firm":true}`
- verdict: **unqualified** (Gemini advised: unqualified), round 2
- real_project: pass: Caller wants a complete redesign and execution of a 2BHK flat.
- service_area: pass: The project site is located in Baner, which is within the Pune service area.
- timeline: fail: Needed in about 8 weeks and the caller said the date is fixed.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: The caller confirmed they are making the decision directly.
- decline_reason: We cannot take on this project because complete design and execution for a full home cannot be delivered within an eight-week timeframe.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Caller has a firm move-in date in eight weeks for a full 2BHK execution.
- PASS

### E15.1: No location given
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 3BHK","bhk":3,"needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **ask_question** (Gemini advised: ask_question), round 1
- real_project: pass: Caller wants full redesign and execution for their 3BHK home.
- service_area: unclear: No project location was specified by the caller.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: Caller stated they are the decision maker.
- questions: [service_area] Where in Pune or PCMC is your property located?
- handoff_notes: Location within Pune or PCMC needs confirmation.
- PASS

### E15.2: ...caller says Kothrud
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 3BHK","bhk":3,"location_text":"Kothrud","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **qualified** (Gemini advised: qualified), round 2
- real_project: pass: Caller wants full design and execution for a 3BHK flat.
- service_area: pass: The project location is Kothrud, which is within the Pune service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: The caller did not mention a budget.
- decision_maker: pass: The caller confirmed they are the decision-maker.
- handoff_notes: Caller is looking for a full redesign and execution of a 3BHK in Kothrud with a 5-month timeline.
- PASS

### E16: Lonavala
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Interiors for our weekend villa","location_text":"Lonavala","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: pass: Caller wants full home interior design and execution for a weekend villa.
- service_area: fail: The project site is located in Lonavala, which is outside the studio's service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: The caller is the decision maker.
- decline_reason: I am sorry, but we currently only take on projects within Pune and PCMC and do not serve Lonavala.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Project is located in Lonavala, outside service boundary.
- PASS

### E17: Mumbai
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my flat","location_text":"Andheri, Mumbai","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **unqualified** (Gemini advised: unqualified), round 1
- real_project: pass: Caller wants full home redesign including design and execution.
- service_area: fail: The project location is Andheri, Mumbai, which is outside Pune and PCMC.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller is the decision maker.
- decline_reason: We currently only take on projects within Pune and PCMC, so we are unable to serve projects located in Mumbai.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Project is located in Mumbai, which is outside the service area.
- PASS

### E18: Hinjewadi (PCMC list)
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Hinjewadi","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full redesign and execution of a 2BHK home.
- service_area: pass: The project location is Hinjewadi, which is within the PCMC service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller did not mention a budget.
- decision_maker: pass: The caller is the decision-maker.
- handoff_notes: Project is a full redesign and execution of a 2BHK in Hinjewadi needed in about 5 months.
- PASS

### E19.1: No timing at all
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Baner"}`
- verdict: **ask_question** (Gemini advised: ask_question), round 1
- real_project: pass: Caller wants full design and execution for a 2BHK flat.
- service_area: pass: Baner is located within the studio's primary service area in Pune.
- timeline: unclear: No project completion timeline or move-in date was provided.
- budget_band: not_mentioned: The caller did not state a budget.
- decision_maker: pass: The caller confirmed they are the primary decision maker.
- questions: [timeline] When would you need the project to be completed?
- PASS

### E19.2: ...caller says in 6 months
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 2BHK","bhk":2,"location_text":"Baner","needed_by_text":"in about 6 months","weeks_until_needed":26}`
- verdict: **qualified** (Gemini advised: qualified), round 2
- real_project: pass: Caller wants full design and execution for a 2BHK flat.
- service_area: pass: The project is located in Baner, which is within the Pune service area.
- timeline: pass: Needed in 26 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget details.
- decision_maker: pass: The caller is the primary decision-maker.
- handoff_notes: Full 2BHK redesign and execution in Baner. | Timeline is around six months out.
- PASS

### E20.1: Unsure whether they want execution
- answers: `{"project_type":"single_room","wants_design_and_execution":"unclear","project_description":"I'm thinking of doing something with my bedroom, not sure what","location_text":"Aundh","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **ask_question** (Gemini advised: ask_question), round 1
- real_project: unclear: The caller wants to do something with their bedroom but it is unclear whether they need full design and execution.
- service_area: pass: The project is located in Aundh, which is within the Pune service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: The caller is the decision maker.
- questions: [real_project] Are you looking for complete design and execution for your bedroom redesign?
- handoff_notes: Caller is considering a bedroom redesign but is uncertain about the exact scope.
- PASS

### E20.2: ...caller wants full design and execution
- answers: `{"project_type":"single_room","wants_design_and_execution":"yes","project_description":"Yes, I want the complete redesign with execution done by you","location_text":"Aundh","needed_by_text":"in 5 months","weeks_until_needed":20,"decision_maker":"self"}`
- verdict: **qualified** (Gemini advised: qualified), round 2
- real_project: pass: Caller confirmed they want complete redesign and execution of a single room.
- service_area: pass: Aundh is within the Pune service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: No budget was mentioned by the caller.
- decision_maker: pass: Caller confirmed they are making the decision themselves.
- handoff_notes: Project is a single room full redesign and execution in Aundh with a five-month timeline.
- PASS

### E21.1: Two unclear at once (location and timing)
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 3BHK","bhk":3}`
- verdict: **ask_question** (Gemini advised: ask_question), round 1
- real_project: pass: Caller wants full redesign and execution for their 3BHK flat.
- service_area: unclear: No project location was specified.
- timeline: unclear: No completion or handover timeline was provided.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller stated they are making the decisions themselves.
- questions: [service_area] Where in Pune or PCMC is the property located? | [timeline] By when would you need the project to be completed?
- handoff_notes: Location and timeline need clarification.
- PASS

### E21.2: ...caller answers both
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 3BHK","bhk":3,"location_text":"Baner","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **qualified** (Gemini advised: qualified), round 2
- real_project: pass: Caller wants full design and execution for a 3BHK home.
- service_area: pass: The project location is Baner, which is within the Pune service area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller confirms they are the decision maker.
- handoff_notes: Full 3BHK redesign in Baner needed in about 5 months.
- PASS

### E22.1: Still unclear after the one question
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 3BHK","bhk":3,"location_text":"somewhere near Pune","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **ask_question** (Gemini advised: ask_question), round 1
- real_project: pass: Caller wants full redesign and execution of a 3BHK home.
- service_area: unclear: Location was described generally as somewhere near Pune rather than a specific area.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget figures.
- decision_maker: pass: Caller confirms they are the decision-maker.
- questions: [service_area] Could you share the specific neighborhood or area where your home is located?
- handoff_notes: Location needs confirmation to ensure it falls within Pune or PCMC.
- PASS

### E22.2: ...caller still will not say
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 3BHK","bhk":3,"location_text":"I would rather not say yet","needed_by_text":"in 5 months","weeks_until_needed":20}`
- verdict: **unqualified** (Gemini advised: qualified), round 2
- real_project: pass: Caller wants full redesign and execution of a 3BHK home.
- service_area: unclear: Caller declined to state the location.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: not_mentioned: Caller did not mention any budget.
- decision_maker: pass: Caller confirms they are the decision-maker.
- decline_reason: I was not able to confirm a few details I need before passing this to a designer.
- close_script: This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.
- handoff_notes: Location is unspecified as caller preferred not to disclose it yet. | Could not confirm service area after one question: Caller declined to state the location.
- PASS

### E23: Large budget that fits the scope
- answers: `{"project_type":"full_home","wants_design_and_execution":"yes","decision_maker":"self","project_description":"Full redesign of my 3BHK","bhk":3,"area_sq_ft":1500,"location_text":"Koregaon Park","needed_by_text":"in 5 months","weeks_until_needed":20,"budget_volunteered_inr":4000000,"budget_text":"around 40 lakh"}`
- verdict: **qualified** (Gemini advised: qualified), round 1
- real_project: pass: Caller wants full redesign and execution of a residential apartment.
- service_area: pass: Location is Koregaon Park, which is within Pune city.
- timeline: pass: Needed in 20 weeks or more.
- budget_band: pass: Caller volunteered a budget that plausibly fits the scope.
- decision_maker: pass: Caller is deciding for themselves.
- handoff_notes: Project is a full redesign of a three-bedroom apartment in Koregaon Park.
- PASS
