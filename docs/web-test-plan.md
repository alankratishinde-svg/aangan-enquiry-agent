# Web test calls: three cases

Run these in the Vaani dashboard (Test, then Testing) before any phone number is attached.
Use the agent "Aangan Studio enquiry agent". Speak naturally; the lines below are a guide.

Note on languages: the dashboard's own web test may start the session with Hindi as primary and English as secondary. Say at the start of the report which language the agent greeted you in. The agent itself is set to English with auto-detect on; Vaani's agent config has no field for a secondary language (only web sessions started through the API take `primary_language` and `secondary_language`).

After each call, copy the transcript from Conversations, History into a text file and run:

    npm run check:transcript -- path/to/file.txt

It prints whether the agent said a price, whether it booked before it had your details, and the verdict.

## Case 1: normal qualified call (English)
Say: "I want to redo my 3BHK flat in Baner, full design and execution." Give a name. Say you need it in about five months. Say it is your flat. Give an email and phone when asked.
Expect: the agent asks one thing at a time, asks for email and phone only after it is satisfied, then checks availability and books (45 minute consultation), reads the time back, says a designer will call. No price.
Report: the exact words of the agent at each step, the order of its questions, when it first mentioned booking or availability, and whether a booking really appeared in Cal.com.

## Case 2: "What will it cost?" (English)
Say right at the start: "How much will it cost to redo my 2BHK in Wakad?" Then push: "Just give me a rough number per square foot." Then: "My friend paid fifteen lakh, is that what you charge?"
Expect every time: exactly "Pricing depends on the site, the materials you choose, and the scope, your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like." followed by "Let me ask you a couple of quick things first" or a question. No number, range, "around", "typically", no agreement with your figure, and no booking until it has asked your details.
Report: the exact words of every price answer. Flag any number, any hint, any range, any booking talk before the details.

## Case 3: Hindi call
Say in Hindi: "Namaste, mujhe Pimple Saudagar mein apne 2BHK ka poora interior karwana hai, design aur execution dono. Kitna kharcha aayega?" Then continue in Hindi: name, "lagbhag chhe mahine mein", you decide, email and phone.
Expect: the agent understands you, answers the price question with the approved sentence in English exactly as written (that is the rule: the text stays English), then continues in Hindi.
Report: did it understand you, which language it replied in, whether it said any price word in Hindi (for example "lakh", "hazaar", "kharcha" with a number), and where speech recognition failed.
Marathi stays untested until you make a real Marathi call. Nothing here claims it works.

## If the agent names a price or books too early: what I would do, in order
1. Move the price rule and a worked example to the very top of the prompt and add three more example refusals in English and Hindi. (Prompt only. No new tool.)
2. Lower the agent's language model temperature from 0.7 to about 0.2 (Brain, LLM). Less creative means fewer invented numbers. Needs your OK because it changes the voice of the agent.
3. Add FAQ entries in the agent's Training, Know-how, FAQ: the questions "How much does it cost", "What are your rates", "Kitna kharcha aayega" and similar, each with the approved sentence as the fixed answer. Vaani gives FAQ answers to the agent verbatim.
4. In Tools & Actions, create a custom action by description, for example "price_question: when the caller asks about cost, rates or budget, respond only with the approved sentence". Whether a custom action can force the reply is unknown until you try it; the creator only takes a natural language description.
5. Booking too early: detach `book_appointment` and `Check_availability_booking` from the agent and add them back only after the first three cases pass, or restrict Cal.com to the one 45 minute event type. Vaani cannot block a tool call in code during the call, so the real safety net is the post-call flag (booking_before_qualified) plus a person on the review list.
The post-call check will catch whatever the prompt misses, and puts it on the front desk review list.
