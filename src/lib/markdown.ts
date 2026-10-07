/**
 * Return the body of the first heading whose text equals `heading` (case-insensitive),
 * up to the next heading of the same or higher level. Returns null when not found.
 */
export function getSection(md: string, heading: string): string | null {
  const lines = md.split("\n");
  const want = heading.trim().toLowerCase();
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[i] ?? "");
    if (!m) continue;
    const text = (m[2] ?? "").replace(/[*_`]/g, "").trim().toLowerCase();
    if (start === -1) {
      if (text === want) {
        start = i + 1;
        level = (m[1] ?? "").length;
      }
    } else if ((m[1] ?? "").length <= level) {
      return lines.slice(start, i).join("\n").trim();
    }
  }
  return start === -1 ? null : lines.slice(start).join("\n").trim();
}
