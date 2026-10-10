export interface Turn {
  index: number;
  /** Clock time from the transcript, "13:33:14", when present. */
  clock: string | null;
  role: "agent" | "user" | "other";
  text: string;
}

// One turn starts at a line like "[13:33:14] AGENT: text", "AGENT: text" or "Agent: text". Vaani separates turns with a
// single newline in call_postprocessing and call_details, with a blank line in older examples, and test deliveries
// use "Agent: Hello\nUser: Hi". Lines that do not start a turn continue the previous one.
const TURN_START = /^\s*(?:\[(\d{1,2}:\d{2}:\d{2})\]\s*)?(AGENT|USER|CALLER|CUSTOMER|ASSISTANT|BOT|AI)\s*:\s*(.*)$/i;
const AGENT_LABELS = new Set(["AGENT", "ASSISTANT", "BOT", "AI"]);

export function parseTranscript(transcript: string): Turn[] {
  const turns: Turn[] = [];
  for (const line of transcript.split(/\r?\n/)) {
    const m = TURN_START.exec(line);
    if (m) {
      const who = (m[2] ?? "").toUpperCase();
      turns.push({ index: turns.length, clock: m[1] ?? null, role: AGENT_LABELS.has(who) ? "agent" : "user", text: (m[3] ?? "").trim() });
    } else if (line.trim()) {
      if (turns.length === 0) turns.push({ index: 0, clock: null, role: "other", text: line.trim() });
      else turns[turns.length - 1]!.text += `\n${line.trim()}`;
    }
  }
  return turns;
}

export function formatTurnsForPrompt(turns: Turn[]): string {
  return turns.map((t) => `[${t.index}] ${t.role.toUpperCase()}: ${t.text}`).join("\n");
}
