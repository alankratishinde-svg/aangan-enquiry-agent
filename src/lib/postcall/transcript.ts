export interface Turn {
  index: number;
  /** Clock time from the transcript, "13:33:14", when present. */
  clock: string | null;
  role: "agent" | "user" | "other";
  text: string;
}

const SEGMENT = /^\[(\d{1,2}:\d{2}:\d{2})\]\s*([A-Za-z ]+?)\s*:\s*([\s\S]*)$/;

/**
 * Vaani transcript format (docs.vaanivoice.ai, call_postprocessing):
 *   "[13:33:14] AGENT: Hi!\n\n[13:33:19] USER: Yeah."
 */
export function parseTranscript(transcript: string): Turn[] {
  // Get Call Details returns "AGENT: ...\n\n USER: ..." with no clock times.
  if (!/\[\d{1,2}:\d{2}:\d{2}\]/.test(transcript)) return parsePlainTranscript(transcript);
  const parts = transcript.split(/\n\s*\n(?=\[\d{1,2}:\d{2}:\d{2}\])/).map((p) => p.trim()).filter(Boolean);
  const turns: Turn[] = [];
  for (const part of parts) {
    const m = SEGMENT.exec(part);
    if (!m) {
      if (turns.length === 0 && part) turns.push({ index: 0, clock: null, role: "other", text: part });
      else if (turns.length > 0) turns[turns.length - 1]!.text += `\n${part}`;
      continue;
    }
    const who = (m[2] ?? "").trim().toUpperCase();
    turns.push({
      index: turns.length,
      clock: m[1] ?? null,
      role: who === "AGENT" ? "agent" : who === "USER" ? "user" : "other",
      text: (m[3] ?? "").trim(),
    });
  }
  return turns;
}

export function formatTurnsForPrompt(turns: Turn[]): string {
  return turns.map((t) => `[${t.index}] ${t.role.toUpperCase()}: ${t.text}`).join("\n");
}

function parsePlainTranscript(transcript: string): Turn[] {
  const turns: Turn[] = [];
  for (const block of transcript.split(/\n\s*\n/)) {
    const m = /^\s*(AGENT|USER)\s*:\s*([\s\S]*)$/i.exec(block);
    if (m) turns.push({ index: turns.length, clock: null, role: m[1]!.toUpperCase() === "AGENT" ? "agent" : "user", text: m[2]!.trim() });
    else if (block.trim()) {
      if (turns.length) turns[turns.length - 1]!.text += `\n${block.trim()}`;
      else turns.push({ index: 0, clock: null, role: "other", text: block.trim() });
    }
  }
  return turns;
}
