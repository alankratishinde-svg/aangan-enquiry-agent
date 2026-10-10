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
