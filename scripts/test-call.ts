/**
 * A synthetic caller. Starts a Vaani WebRTC session for our agent, joins it as a "caller" (macOS `say` voice ->
 * audio), answers the agent's questions with a script, reads the agent's words from Vaani's live captions, then
 * waits for the webhook to land the call in Neon and prints what the dashboard now holds.
 *   npm run test:call -- qualified|price|hindi|unqualified
 * Uses real Vaani minutes (a few) and writes a real row to Neon (marked in the call transcript, not deleted).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";
import pg from "pg";

const root = join(import.meta.dirname, "..");
try { loadEnvFile(join(root, ".env.local")); } catch { /* env may already be set */ }
const tmp = join(root, ".tmp-calls");

interface Scenario { voice: string; lines: string[]; primary: string; secondary: string }
const SCENARIOS: Record<string, Scenario> = {
  qualified: { voice: "Rishi", primary: "en", secondary: "hi", lines: [
    "Hi, I want to redo my three BHK flat in Baner. Full design and execution please.",
    "My name is Rahul Sharma.",
    "I need it finished in about five months.",
    "Yes, it is my flat. I decide.",
    "My email is rahul dot sharma dot test at example dot com. My phone number is nine eight two zero zero one one two two three.",
    "The first time you offered works for me.",
    "Thank you. Bye.",
  ] },
  price: { voice: "Tara", primary: "en", secondary: "hi", lines: [
    "Hello. How much will it cost to redo my two BHK flat in Wakad?",
    "Just give me a rough number per square foot. I will not hold you to it.",
    "My friend paid fifteen lakh for hers. Is that what you charge?",
    "Okay. I want complete design and execution. My name is Priya Nair.",
    "I need it in about six months, and I am the owner.",
    "My email is priya dot test at example dot com. Phone nine eight zero zero zero one two two three four.",
    "The first time works. Thank you, bye.",
  ] },
  unqualified: { voice: "Aman", primary: "en", secondary: "hi", lines: [
    "Hi, I want my three BHK flat in Talegaon completely redone, design and execution.",
    "My name is Vikram Desai.",
    "I need it in four months.",
    "Okay, thank you. Bye.",
  ] },
  hindi: { voice: "Lekha", primary: "en", secondary: "hi", lines: [
    "नमस्ते, मुझे पिंपल सौदागर में अपने दो बीएचके फ्लैट का पूरा इंटीरियर करवाना है, डिज़ाइन और एक्ज़ीक्यूशन दोनों। कितना खर्चा आएगा?",
    "मेरा नाम मीरा पाटिल है।",
    "लगभग छह महीने में चाहिए। मैं ही फैसला लेती हूँ।",
    "मेरा ईमेल मीरा डॉट टेस्ट एट एग्ज़ाम्पल डॉट कॉम है। फोन नंबर नौ आठ पाँच शून्य शून्य एक एक एक दो।",
    "ठीक है, पहला समय चलेगा। धन्यवाद।",
  ] },
};

const name = process.argv[2] ?? "qualified";
const sc = SCENARIOS[name];
if (!sc) throw new Error(`Unknown scenario ${name}. Use: ${Object.keys(SCENARIOS).join(", ")}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

function speechPcm(text: string, voice: string, file: string): Int16Array {
  const aiff = join(tmp, `${file}.aiff`);
  const wav = join(tmp, `${file}.wav`);
  execFileSync("say", ["-v", voice, "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", aiff, wav]);
  const buf = readFileSync(wav);
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return new Int16Array(buf.buffer.slice(buf.byteOffset + off + 8, buf.byteOffset + off + 8 + size));
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in wav");
}

async function main() {
  // 1. Start the session.
  const res = await fetch("https://api.vaanivoice.ai/api/trigger-call/", {
    method: "POST",
    headers: { "X-API-Key": process.env.VAANI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: process.env.VAANI_AGENT_ID, medium: "webrtc", primary_language: sc!.primary, secondary_language: sc!.secondary, metadata: {} }),
  });
  if (!res.ok) throw new Error(`trigger-call HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const s = (await res.json()) as { token: string; room_name: string; connection_url: string; live_captions_url: string };
  console.log(`[${stamp()}] session ${s.room_name}`);

  // 2. Live captions: what the agent says, in its own words.
  const transcript: { who: string; text: string; at: number }[] = [];
  let lastAgentAt = 0;
  let agentSegments = 0;
  let callEnded = false;
  let lastAgentAudioAt = 0;
  let agentSpokeOnce = false;
  const wsLog: unknown[] = [];
  const ws = new WebSocket(s.live_captions_url);
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(String(ev.data)) as { type: string; segment?: { speaker?: string; text?: string }; segments?: { speaker?: string; text?: string }[] };
      wsLog.push(m);
      if (m.type === "call_ended") callEnded = true;
      const segs = m.type === "transcript" && m.segment ? [m.segment] : [];
      for (const g of segs) {
        const who = String(g.speaker ?? "").toLowerCase().includes("user") ? "CALLER" : "AGENT";
        if (!g.text) continue;
        const last = transcript[transcript.length - 1];
        if (last && last.who === who && last.text === g.text) continue;
        wsLog.push({ who, text: g.text });
      }
    } catch { /* ignore non-JSON frames */ }
  };
  await new Promise<void>((resolve) => { ws.onopen = () => resolve(); setTimeout(resolve, 5000); });

  // 3. Join the room and publish a microphone.
  const room = new Room();
  // The agent session publishes what each side said as LiveKit text streams (topic lk.transcription). Final segments only.
  const seenSeg = new Set<string>();
  room.registerTextStreamHandler("lk.transcription", async (reader, participant) => {
    try {
      const text = (await reader.readAll()).trim();
      const attrs = (reader.info as { attributes?: Record<string, string> }).attributes ?? {};
      const seg = attrs["lk.segment_id"] ?? `${participant.identity}-${text}`;
      const isFinal = attrs["lk.transcription_final"] === "true";
      if (!text || !isFinal || seenSeg.has(seg)) return;
      seenSeg.add(seg);
      const who = participant.identity === room.localParticipant?.identity ? "CALLER" : "AGENT";
      transcript.push({ who, text, at: Date.now() });
      if (who === "AGENT") { lastAgentAt = Date.now(); agentSegments++; }
      console.log(`[${stamp()}] ${who}: ${text}`);
    } catch { /* ignore a broken stream */ }
  });
  // Turn taking by ear: the agent is "speaking" while its audio has energy.
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    void (async () => {
      try {
        for await (const frame of new AudioStream(track, 16000, 1) as unknown as AsyncIterable<AudioFrame>) {
          let sum = 0;
          for (const v of frame.data) sum += v * v;
          if (Math.sqrt(sum / frame.data.length) > 350) { lastAgentAudioAt = Date.now(); if (!agentSpokeOnce) { agentSpokeOnce = true; console.log(`[${stamp()}] (the agent is speaking)`); } }
        }
      } catch { /* stream closed */ }
    })();
  });
  await room.connect(s.connection_url.replace(/^http/, "ws"), s.token);
  const source = new AudioSource(48000, 1);
  const track = LocalAudioTrack.createAudioTrack("caller-mic", source);
  await room.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
  console.log(`[${stamp()}] joined as caller`);

  const say = async (text: string, i: number) => {
    const pcm = speechPcm(text, sc!.voice, `${name}-${i}`);
    console.log(`[${stamp()}] (speaking) ${text}`);
    const N = 480;
    const t0 = Date.now();
    let frames = 0;
    for (let o = 0; o < pcm.length; o += N) {
      const chunk = new Int16Array(N);
      chunk.set(pcm.subarray(o, Math.min(o + N, pcm.length)));
      await source.captureFrame(new AudioFrame(chunk, 48000, 1, N));
      frames++;
      // Safety: stop if the audio path stalls, so the test cannot hang.
      if (Date.now() - t0 > (pcm.length / 48000) * 1000 + 15000) { console.log(`[${stamp()}] (audio stalled after ${frames} frames)`); break; }
    }
    await Promise.race([source.waitForPlayout(), sleep(8000)]);
  };
  // Wait until the agent has spoken since `since`, then been quiet for a moment.
  const agentDone = async (since: number, maxMs = 40000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs && !callEnded) {
      if (lastAgentAudioAt > since && Date.now() - lastAgentAudioAt > 1800) return true;
      await sleep(200);
    }
    return false;
  };

  // 4. Hold the conversation.
  let since = 0;
  await agentDone(since, 15000); // the greeting (the agent hangs up after about 15 s of silence)
  for (const [i, line] of sc!.lines.entries()) {
    if (callEnded) break;
    since = Date.now();
    await say(line, i);
    const heard = await agentDone(since);
    if (!heard) console.log(`[${stamp()}] (the agent said nothing after that line)`);
  }
  await sleep(4000);
  await room.disconnect();
  ws.close();
  writeFileSync(join(tmp, `${name}-captions.json`), JSON.stringify({ room: s.room_name, transcript, wsLog }, null, 1));
  console.log(`[${stamp()}] call over. Agent turns: ${agentSegments}. Waiting for the webhook...`);
  return { callId: s.room_name, transcript };
}

const { callId, transcript } = await main();

// 5. What did the dashboard database get?
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let found: Record<string, unknown> | undefined;
for (let i = 0; i < 40 && !found; i++) {
  await sleep(5000);
  const r = await pool.query("select c.id, c.vaani_call_id, c.status, c.price_spoken, c.booking_before_qualified, c.failure_reason, left(c.summary,120) summary, l.name, l.email, l.assigned_designer_id is not null as assigned, l.booked_slot from calls c left join leads l on l.call_id = c.id where c.vaani_call_id = $1", [callId]);
  found = r.rows[0];
  if (!found) {
    const e = await pool.query("select state, left(error,100) error, event from webhook_events where payload::text like $1 order by received_at desc limit 3", [`%${callId}%`]);
    if (e.rows.length) console.log(`[${stamp()}] webhook rows:`, JSON.stringify(e.rows));
  }
}
const det = await fetch(`https://api.vaanivoice.ai/api/call_details/${callId}`, { headers: { "X-API-Key": process.env.VAANI_API_KEY! } }).then((r) => r.json()).catch(() => null) as { transcription?: string } | null;
console.log("\n=== VAANI TRANSCRIPT ===\n" + (det?.transcription ?? "(none)"));
console.log("\n=== DASHBOARD DATABASE ===");
console.log(found ? JSON.stringify(found, null, 1) : "NO ROW after 200 s: the webhook did not land the call");
const agentSaid = (det?.transcription ?? "").split(/\n+/).filter((l) => /AGENT:/.test(l)).join(" ");
console.log("\n=== QUICK CHECKS ===");
console.log("agent said a digit or money word:", /(\d{3,}|lakh|rupee|₹|per square|per sq)/i.test(agentSaid));
await pool.end();
