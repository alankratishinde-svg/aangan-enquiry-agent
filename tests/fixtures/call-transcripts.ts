export type Line = ["agent" | "user", string];

export const DEFLECTION =
  "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.";

const OPEN: Line = ["agent", "Hello, thank you for calling Aangan Studio. How can I help you today?"];

export interface TranscriptCase {
  id: string;
  scenario: string;
  lines: Line[];
  expect: { status: "qualified" | "unqualified" | "failed"; priceSpoken: boolean; bookingFlag: boolean; deal: boolean };
}

export const TRANSCRIPT_CASES: TranscriptCase[] = [
  {
    id: "P1", scenario: "Normal qualified call, booked after the details",
    expect: { status: "qualified", priceSpoken: false, bookingFlag: false, deal: true },
    lines: [OPEN,
      ["user", "Hi, I want to redo my 3BHK flat in Baner. Complete interiors with execution."],
      ["agent", "Lovely. May I have your name?"], ["user", "Rahul Sharma."],
      ["agent", "Thank you Rahul. When would you need the project to be complete?"], ["user", "In about five months."],
      ["agent", "Are you the person who will be deciding on the project?"], ["user", "Yes, it's my flat."],
      ["agent", "Great, this looks like a good fit. Could I have your email address and phone number?"],
      ["user", "rahul dot sharma at gmail dot com, and 98220 11223."],
      ["agent", "Thank you. Let me check availability. I can offer Tuesday at 11 AM or Wednesday at 3 PM."], ["user", "Tuesday at 11 works."],
      ["agent", "Booked for Tuesday at 11 AM. A designer will call you then."]],
  },
  {
    id: "P2", scenario: "Caller asks the cost, agent uses the approved deflection",
    expect: { status: "qualified", priceSpoken: false, bookingFlag: false, deal: true },
    lines: [OPEN,
      ["user", "I want my 2BHK in Wakad redone fully. How much will it cost?"],
      ["agent", DEFLECTION + " Let me ask you a couple of quick things first. May I have your name?"], ["user", "Priya Nair."],
      ["agent", "When would you need it completed?"], ["user", "Around six months from now."],
      ["agent", "Thank you Priya, this is a good fit. Could I have your email and phone number?"], ["user", "priya.nair at outlook dot com, 99001 22334."],
      ["agent", "Let me check availability. I can offer Thursday at 10 AM."], ["user", "Okay."],
      ["agent", "Booked for Thursday at 10 AM. A designer will call you."]],
  },
  {
    id: "P3", scenario: "Agent quotes a price (range in lakh)",
    expect: { status: "qualified", priceSpoken: true, bookingFlag: false, deal: true },
    lines: [OPEN,
      ["user", "I want my 3BHK in Aundh redesigned fully. What does it cost?"],
      ["agent", "For a 3BHK like yours it usually costs around 15 to 20 lakh. May I have your name?"], ["user", "Amit Joshi."],
      ["agent", "When would you need it completed?"], ["user", "In four months."],
      ["agent", "Good fit. Could I have your email and phone?"], ["user", "amit.joshi at gmail dot com, 98765 43210."],
      ["agent", "Let me check availability. I can offer Friday at 4 PM."], ["user", "Fine."],
      ["agent", "Booked for Friday at 4 PM."]],
  },
  {
    id: "P4", scenario: "Agent hints a price in Hinglish number words (no currency word)",
    expect: { status: "qualified", priceSpoken: true, bookingFlag: false, deal: true },
    lines: [OPEN,
      ["user", "Namaste, mujhe Kothrud mein apna 3BHK flat poora redesign karwana hai. Kitna kharcha aayega?"],
      ["agent", "Aam taur par pandrah se bees ke beech mein aa jaata hai. Aapka naam kya hai?"], ["user", "Sneha Kulkarni."],
      ["agent", "Aapko yeh kaam kab tak chahiye?"], ["user", "Paanch mahine mein."],
      ["agent", "Theek hai, yeh hamare liye sahi hai. Kya main aapka email aur phone number le sakti hoon?"], ["user", "sneha.k at gmail dot com, 97654 12345."],
      ["agent", "Main availability dekhti hoon. Shanivaar subah gyarah baje ka slot hai."], ["user", "Haan, theek hai."],
      ["agent", "Shanivaar subah gyarah baje book ho gaya. Designer aapko call karenge."]],
  },
  {
    id: "P5", scenario: "Agent starts booking before asking location or timing",
    expect: { status: "qualified", priceSpoken: false, bookingFlag: true, deal: true },
    lines: [OPEN,
      ["user", "I want to redo my flat completely, full design and execution."],
      ["agent", "Wonderful. Shall I book a consultation for you? I have Tuesday at 11 AM."], ["user", "Sure, Tuesday works."],
      ["agent", "Booked for Tuesday at 11 AM. Could I have your name?"], ["user", "Karan Mehta."],
      ["agent", "And where is the property?"], ["user", "It's in Viman Nagar, 3BHK."],
      ["agent", "When do you need it done?"], ["user", "In about five months."],
      ["agent", "Thanks. Could I have your email and phone?"], ["user", "karan.m at gmail dot com, 98111 22233."],
      ["agent", "A designer will call you on Tuesday."]],
  },
  {
    id: "P6", scenario: "Talegaon caller, agent declines politely, no booking",
    expect: { status: "unqualified", priceSpoken: false, bookingFlag: false, deal: false },
    lines: [OPEN,
      ["user", "I want my whole 3BHK redone, it's in Talegaon."],
      ["agent", "Thank you. May I have your name?"], ["user", "Vikram Desai."],
      ["agent", "We currently serve Pune city and Pimpri-Chinchwad only, so Talegaon is outside our area. This sounds like it may not be the right fit for us right now, but feel free to reach out if things change."],
      ["user", "Okay, thanks."], ["agent", "Thank you for calling. Have a good day."]],
  },
  {
    id: "P7", scenario: "Hindi qualified call",
    expect: { status: "qualified", priceSpoken: false, bookingFlag: false, deal: true },
    lines: [OPEN,
      ["user", "Namaste, mujhe Pimple Saudagar mein apne 2BHK ka poora interior karwana hai, design aur execution dono."],
      ["agent", "Bahut accha. Aapka naam kya hai?"], ["user", "Meera Patil."],
      ["agent", "Aapko yeh kaam kab tak chahiye hoga?"], ["user", "Lagbhag chhe mahine mein."],
      ["agent", "Kya aap hi is project ka faisla lengi?"], ["user", "Haan, main hi decide karti hoon."],
      ["agent", "Yeh hamare liye sahi hai. Kya aap apna email aur phone number bata sakti hain?"], ["user", "meera.patil at gmail dot com, 98500 11122."],
      ["agent", "Main availability dekhti hoon. Mangalvaar subah gyarah baje ka slot hai."], ["user", "Theek hai."],
      ["agent", "Mangalvaar subah gyarah baje book ho gaya. Designer aapko call karenge."]],
  },
  {
    id: "P8", scenario: "Nashik caller but agent books a consultation anyway",
    expect: { status: "unqualified", priceSpoken: false, bookingFlag: true, deal: false },
    lines: [OPEN,
      ["user", "I want my 3BHK in Nashik fully redesigned, in about four months."],
      ["agent", "Wonderful, could I have your email and phone?"], ["user", "dev at gmail dot com, 98000 99887."],
      ["agent", "Let me check availability. I can offer Monday at 12."], ["user", "Okay."],
      ["agent", "Booked for Monday at 12. A designer will call you."]],
  },
  {
    id: "P9", scenario: "Qualified caller wrongly told it is not a fit",
    expect: { status: "qualified", priceSpoken: false, bookingFlag: false, deal: true },
    lines: [OPEN,
      ["user", "I need full design and execution for my 2BHK in Hadapsar, I need it in five months, I'm the owner."],
      ["agent", "Thank you. Unfortunately this sounds like it may not be the right fit for us right now, but feel free to reach out if things change."],
      ["user", "Oh, okay."], ["agent", "Thank you for calling."]],
  },
];
