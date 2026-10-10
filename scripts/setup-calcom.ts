/**
 * Idempotent Cal.com setup from config: a 45-minute event type on its own availability
 * schedule (default 10:00 to 19:00, Mon to Sat, Asia/Kolkata). Leaves your default schedule alone.
 * Usage: npm run calcom:setup
 */
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { loadConfig } from "../src/lib/config";

try { loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* env may already be set */ }

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SCHEDULE_NAME = "Aangan consultation hours";
const SLUG = "aangan-consultation";
const key = process.env.CALCOM_API_KEY;
if (!key) throw new Error("CALCOM_API_KEY is not set");

async function cal(method: string, path: string, version: string, body?: unknown) {
  const res = await fetch(`https://api.cal.com/v2${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "cal-api-version": version, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cal.com ${method} ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).data;
}
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

const cfg = loadConfig(process.env);
const availability = [{ days: cfg.bookableDays.map((d) => DAYS[d]), startTime: hh(cfg.bookableStartHour), endTime: hh(cfg.bookableEndHour) }];

const schedules = (await cal("GET", "/schedules", "2024-06-11")) as { id: number; name: string }[];
let schedule = schedules.find((s) => s.name === SCHEDULE_NAME);
if (schedule) {
  await cal("PATCH", `/schedules/${schedule.id}`, "2024-06-11", { availability, timeZone: cfg.officeTz });
} else {
  schedule = await cal("POST", "/schedules", "2024-06-11", { name: SCHEDULE_NAME, timeZone: cfg.officeTz, isDefault: false, availability });
}
const types = (await cal("GET", "/event-types", "2024-06-14")) as { id: number; slug: string }[];
const et = types.find((t) => t.slug === SLUG);
if (!et) throw new Error(`Event type ${SLUG} not found`);
await cal("PATCH", `/event-types/${et.id}`, "2024-06-14", {
  lengthInMinutes: cfg.consultationMinutes,
  scheduleId: schedule!.id,
  minimumBookingNotice: cfg.bookingLeadMinutes,
});
console.log(`Cal.com ready: event type ${et.id} (${SLUG}), ${cfg.consultationMinutes} min, schedule ${schedule!.id} ${JSON.stringify(availability)}, notice ${cfg.bookingLeadMinutes} min`);
