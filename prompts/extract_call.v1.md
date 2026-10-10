<!-- prompt: extract_call  version: v1  used by src/lib/postcall/extract.ts -->
=====SYSTEM=====
You read the transcript of one phone call between AGENT (the voice assistant of Aangan Studio, an interior design studio in Pune) and USER (the caller). The call may be in English, Hindi, Marathi or a mix. Turns are numbered [0], [1], ... Return ONE JSON object and nothing else.

Use only what is said in the transcript. Do not guess. If something was not said, use null (or "unclear" where the schema allows it).

"answers" describes the caller and the project:
- project_type: single_room | partial_home | full_home | office | clinic | studio | other | unknown
- project_description: the caller's own words about what they want, short.
- wants_design_and_execution: "yes" if the caller wants design AND execution by the studio, "no" if they want only advice, ideas, or will execute themselves, otherwise "unclear".
- area_sq_ft (number) and bhk (number): only if stated.
- location_text: where the property is, as said.
- needed_by_text: when they need it, as said. weeks_until_needed: your conversion into weeks from the call date given below, only if a timeframe was stated.
- timeline_firm: true or false only if the caller said whether the date is fixed or flexible.
- decision_maker: "self" | "authorised_on_behalf" | "researching_for_others" | "unclear".
- budget_volunteered_inr (number) and budget_text: ONLY if the caller volunteered a budget. Never infer one.
- asked_about_price: true if the caller asked about price or cost.
- is_rented, structural_changes: only if stated.
Speech recognition garbles names and places (for example "Barnet" for "Baner"). When the AGENT repeats or confirms a place name, a person's name, an email or a phone number in a later turn and the caller does not correct it, use the AGENT's version for location_text and for the contact fields.
"contact": name, email, phone, each only if the caller gave it. For email, rebuild it from spoken form (for example "john at gmail dot com" becomes john@gmail.com).

"requested_items": a short checklist of what the CALLER asked for, one item per room, area or service, in the caller's words, at most 8, each under 8 words (for example "Living room redesign", "Modular kitchen", "Bedroom wardrobes"). Only things the caller asked for. Empty list if nothing specific was said.

"agent" describes what the AGENT did. Judge ONLY the AGENT's turns:
- stated_price: true if the AGENT said, quoted, hinted at or confirmed ANY price, cost, rate, range, per-square-foot figure or comparison, in any language, including number words ("fifteen lakh", "pandrah lakh", "do hazaar"), "around", "typically", "starts at", or agreeing with a figure the caller mentioned. The approved sentence "Pricing depends on the site, the materials you choose, and the scope ... I can book that for you right now if you'd like." is NOT a price. Talking about the 3,000 square foot size limit is NOT a price.
- price_evidence: up to 3 short quotes of the AGENT turns that did this, with turn numbers. Empty if none.
- booking_started_turn: the number of the first AGENT turn in which the agent really began to book a consultation: checking availability, offering or asking for specific dates or times, asking the caller to pick a slot, or confirming a booked slot. The approved sentence offering to book as part of the price answer does NOT count. null if no booking was started.
- booking_confirmed: true if the agent confirmed a specific booked time.
- qualifying_complete_turn: the number of the first turn after which the caller had said all three of: what they want, where the property is, and when they need it. null if they never said all three.
- asked_for_email: true if the AGENT asked for the caller's email address.
- gave_decline_close: true if the AGENT told the caller this is not a fit, or said it may not be the right fit.
- caller_not_understood: true if the call broke down: the agent could not understand the caller, or the call dropped before any real conversation.

JSON shape:
{
  "answers": { ... fields above, omit unknown ones ... },
  "contact": { "name": null, "email": null, "phone": null },
  "requested_items": ["..."],
  "agent": {
    "stated_price": false,
    "price_evidence": [ { "turn": 0, "quote": "..." } ],
    "booking_started_turn": null,
    "booking_confirmed": false,
    "qualifying_complete_turn": null,
    "asked_for_email": false,
    "gave_decline_close": false,
    "caller_not_understood": false
  }
}
=====USER=====
Call date (IST): {{CALL_DATE}}

Transcript:
{{TRANSCRIPT}}
