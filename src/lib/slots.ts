import type { Config } from "./config";
import type { CalendarAdapter, Interval } from "./calendar";
import type { Designer } from "./designers";

// India has no DST, so a fixed offset is exact for Asia/Kolkata.
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

function istParts(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    dow: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function istMidnightMs(d: Date): number {
  const p = istParts(d);
  return Date.UTC(p.year, p.month, p.date) - IST_OFFSET_MS;
}

/** True when `now` is outside bookable days or hours (the brief's "after hours"). */
export function isAfterHours(now: Date, cfg: Config): boolean {
  const p = istParts(now);
  if (!cfg.bookableDays.includes(p.dow)) return true;
  return p.minutes < cfg.bookableStartHour * 60 || p.minutes >= cfg.bookableEndHour * 60;
}

/** All bookable consultation windows over the next `days` days, honouring lead time. */
export function generateSlotGrid(now: Date, cfg: Config, days = 14): Interval[] {
  const earliest = now.getTime() + cfg.bookingLeadMinutes * 60_000;
  const dayZero = istMidnightMs(now);
  const out: Interval[] = [];
  for (let i = 0; i <= days; i++) {
    const dayStart = dayZero + i * DAY_MS;
    const dow = istParts(new Date(dayStart + 12 * 3_600_000)).dow;
    if (!cfg.bookableDays.includes(dow)) continue;
    for (
      let t = cfg.bookableStartHour * 60;
      t + cfg.consultationMinutes <= cfg.bookableEndHour * 60;
      t += cfg.consultationMinutes
    ) {
      const start = dayStart + t * 60_000;
      if (start < earliest) continue;
      out.push({ start: new Date(start), end: new Date(start + cfg.consultationMinutes * 60_000) });
    }
  }
  return out;
}

export interface FreeSlot {
  designerId: string;
  designerName: string;
  start: Date;
  end: Date;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && a.end > b.start;

/** Every (designer, window) pair where the designer's calendar is free. Sorted by start, then designer order. */
export async function findFreeSlots(
  designers: Designer[],
  calendar: CalendarAdapter,
  grid: Interval[],
): Promise<FreeSlot[]> {
  if (grid.length === 0 || designers.length === 0) return [];
  const from = grid[0]!.start;
  const to = grid[grid.length - 1]!.end;
  const busyPerDesigner = await Promise.all(designers.map((d) => calendar.busy(d.googleCalendarId, from, to)));
  const out: FreeSlot[] = [];
  for (const slot of grid) {
    designers.forEach((d, i) => {
      const busy = busyPerDesigner[i] ?? [];
      if (!busy.some((b) => overlaps(slot, b))) {
        out.push({ designerId: d.id, designerName: d.name, start: slot.start, end: slot.end });
      }
    });
  }
  return out;
}

/** Human readable IST range, e.g. "Thu, 8 Oct, 11:00 am to 11:45 am IST". */
export function formatSlotIst(start: Date, end: Date): string {
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(start);
  const time = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  return `${day}, ${time(start)} to ${time(end)} IST`;
}
