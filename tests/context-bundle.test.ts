import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryCalendar } from "../src/lib/calendar";
import { loadConfig } from "../src/lib/config";
import { buildContextBundle, ContextLoadError } from "../src/lib/context-bundle";
import { StaticDesignerSource, type Designer } from "../src/lib/designers";
import { getSection } from "../src/lib/markdown";
import { extractDeflection } from "../src/lib/pricing";
import { generateSlotGrid, isAfterHours } from "../src/lib/slots";

const repoKnowledge = join(import.meta.dirname, "..", "knowledge");

const designers: Designer[] = [
  { id: "d1", name: "Designer One", email: "d1@example.com", googleCalendarId: "cal-1" },
  { id: "d2", name: "Designer Two", email: "d2@example.com", googleCalendarId: "cal-2" },
];

// Wed 7 Oct 2026, 10:00 IST
const WED_10AM = new Date("2026-10-07T04:30:00Z");

let dir: string;
let calendar: InMemoryCalendar;
const cfg = () => loadConfig({ KNOWLEDGE_DIR: dir });
const build = (now = WED_10AM) =>
  buildContextBundle({ config: cfg(), designers: new StaticDesignerSource(designers), calendar, now: () => now });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aangan-knowledge-"));
  await cp(repoKnowledge, dir, { recursive: true });
  calendar = new InMemoryCalendar();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("knowledge loading", () => {
  it("loads the three files into the instructions verbatim", async () => {
    const b = await build();
    expect(b.instructions).toContain(b.knowledge.services.trim());
    expect(b.instructions).toContain(b.knowledge.qualified.trim());
    expect(b.knowledge.services).toContain("Aangan Studio");
  });

  it("reflects an edited file on the next call (no cache)", async () => {
    const before = await build();
    expect(before.instructions).not.toContain("MARKER-SERVICES-42");
    const p = join(dir, "services.md");
    await writeFile(p, (await readFile(p, "utf8")) + "\n- MARKER-SERVICES-42\n");
    const after = await build();
    expect(after.instructions).toContain("MARKER-SERVICES-42");
  });

  it("reflects an edited rubric on the next call", async () => {
    const p = join(dir, "qualified.md");
    await writeFile(p, (await readFile(p, "utf8")) + "\n- MARKER-RUBRIC-7\n");
    expect((await build()).instructions).toContain("MARKER-RUBRIC-7");
  });

  it("fails with ContextLoadError when a file is missing", async () => {
    await rm(join(dir, "qualified.md"));
    await expect(build()).rejects.toBeInstanceOf(ContextLoadError);
    await expect(build()).rejects.toThrow(/qualified\.md/);
  });
});

describe("pricing safety", () => {
  it("uses the exact deflection text from pricing.md", async () => {
    const b = await build();
    const expected =
      "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.";
    expect(b.deflection).toBe(expected);
    expect(b.instructions).toContain(expected);
  });

  it("follows an edited deflection line", async () => {
    const p = join(dir, "pricing.md");
    const md = (await readFile(p, "utf8")).replace("Pricing depends on", "Cost depends on");
    await writeFile(p, md);
    const b = await build();
    expect(b.deflection.startsWith("Cost depends on")).toBe(true);
    expect(b.instructions).toContain("Cost depends on");
  });

  it("keeps every rupee figure from pricing.md out of the instructions", async () => {
    const b = await build();
    const pricing = b.knowledge.pricing;
    const tables =
      (getSection(pricing, "Residential") ?? "") + (getSection(pricing, "Commercial (office / clinic / studio)") ?? "");
    const figures = tables.match(/₹[\d,]+(?:\s*(?:lakh))?/g) ?? [];
    expect(figures.length).toBeGreaterThan(5);
    for (const f of figures) {
      expect(b.instructions, f).not.toContain(f);
    }
    expect(b.instructions).not.toContain("Standard specification");
    expect(b.instructions).not.toContain("per sq ft");
  });

  it("fails closed when the deflection line is removed", async () => {
    const p = join(dir, "pricing.md");
    const md = (await readFile(p, "utf8")).replace(/\*\*The only acceptable response[\s\S]*$/, "");
    await writeFile(p, md);
    await expect(build()).rejects.toBeInstanceOf(ContextLoadError);
  });

  it("fails closed when the never-say section holds a price figure", async () => {
    const p = join(dir, "pricing.md");
    await writeFile(p, (await readFile(p, "utf8")).replace('- "It\'ll cost around..."', '- "It\'ll cost around ₹2,000..."'));
    await expect(build()).rejects.toThrow(/price figure/);
  });

  it("extractDeflection throws on text without the line", () => {
    expect(() => extractDeflection("# nothing here")).toThrow();
  });

  it("states that booking waits for a qualified verdict", async () => {
    const b = await build();
    expect(b.instructions).toMatch(/only after the verdict is qualified/);
  });
});

describe("slots and config", () => {
  it("defaults to 45 min, 10am to 7pm, Monday to Saturday", () => {
    const c = loadConfig({});
    expect(c.consultationMinutes).toBe(45);
    expect(c.bookableStartHour).toBe(10);
    expect(c.bookableEndHour).toBe(19);
    expect(c.bookableDays).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("grid stays inside bookable hours, uses 45 min windows, skips Sunday", () => {
    const grid = generateSlotGrid(WED_10AM, cfg(), 14);
    expect(grid.length).toBeGreaterThan(0);
    for (const s of grid) {
      expect(s.end.getTime() - s.start.getTime()).toBe(45 * 60_000);
      const ist = new Date(s.start.getTime() + 330 * 60_000);
      expect(ist.getUTCDay()).not.toBe(0);
      const startMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      expect(startMin).toBeGreaterThanOrEqual(10 * 60);
      expect(startMin + 45).toBeLessThanOrEqual(19 * 60);
    }
  });

  it("respects the booking lead time", async () => {
    const b = await build(); // 10:00 IST, lead 120 min, so earliest start 12:00 IST
    expect(new Date(b.slots[0]!.start).getTime()).toBeGreaterThanOrEqual(WED_10AM.getTime() + 120 * 60_000);
  });

  it("offers at most maxSlots distinct times", async () => {
    const b = await build();
    expect(b.slots).toHaveLength(8);
    expect(new Set(b.slots.map((s) => s.start)).size).toBe(8);
  });

  it("drops a slot when every designer is busy, keeps it when one is free", async () => {
    const first = (await build()).slots[0]!;
    const busy = { start: new Date(first.start), end: new Date(first.end) };
    calendar.addBusy("cal-1", busy);
    expect((await build()).slots[0]!.start).toBe(first.start); // d2 still free
    expect((await build()).slots[0]!.designerId).toBe("d2");
    calendar.addBusy("cal-2", busy);
    expect((await build()).slots.map((s) => s.start)).not.toContain(first.start);
  });

  it("skips Sunday: Saturday evening call gets Monday slots", async () => {
    const satEvening = new Date("2026-10-10T12:30:00Z"); // Sat 18:00 IST
    const b = await build(satEvening);
    const firstDay = new Date(new Date(b.slots[0]!.start).getTime() + 330 * 60_000).getUTCDay();
    expect(firstDay).toBe(1);
  });

  it("flags after-hours calls and still builds a full bundle", async () => {
    const night = new Date("2026-10-06T20:30:00Z"); // Wed 02:00 IST
    const b = await build(night);
    expect(b.isAfterHours).toBe(true);
    expect(b.slots.length).toBeGreaterThan(0);
    expect(b.instructions).toContain("outside office hours");
    expect((await build()).isAfterHours).toBe(false);
  });

  it("isAfterHours edges", () => {
    const c = loadConfig({});
    expect(isAfterHours(new Date("2026-10-07T04:30:00Z"), c)).toBe(false); // Wed 10:00
    expect(isAfterHours(new Date("2026-10-07T04:29:00Z"), c)).toBe(true); // 09:59
    expect(isAfterHours(new Date("2026-10-07T13:29:00Z"), c)).toBe(false); // 18:59
    expect(isAfterHours(new Date("2026-10-07T13:30:00Z"), c)).toBe(true); // 19:00
    expect(isAfterHours(new Date("2026-10-11T06:30:00Z"), c)).toBe(true); // Sun noon
  });

  it("fails with ContextLoadError when the calendar is down", async () => {
    calendar.failWith = new Error("calendar down");
    await expect(build()).rejects.toBeInstanceOf(ContextLoadError);
  });

  it("rejects bad config", () => {
    expect(() => loadConfig({ BOOKABLE_DAYS: "Mon,Funday" })).toThrow();
    expect(() => loadConfig({ BOOKABLE_START_HOUR: "19", BOOKABLE_END_HOUR: "10" })).toThrow();
    expect(() => loadConfig({ OFFICE_TZ: "America/New_York" })).toThrow();
  });
});
