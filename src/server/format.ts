export const pretty = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "not given");
/** First letter in capitals, for titles. */
export const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
export function istDateTime(iso: string | null | undefined): string {
  if (!iso) return "not set";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " IST";
}
export function ago(iso: string, now = Date.now()): string {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}
