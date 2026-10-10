export interface Config {
  knowledgeDir: string;
  consultationMinutes: number;
  bookableStartHour: number;
  bookableEndHour: number;
  /** 0 = Sunday ... 6 = Saturday */
  bookableDays: number[];
  bookingLeadMinutes: number;
  officeTz: string;
  /** any_clear_fail: one clear fail on criteria 1 to 4 means unqualified. two_or_more: needs two clear fails. */
  failPolicy: "any_clear_fail" | "two_or_more";
  /** Weeks needed before the project must be ready. Below this is a clear fail. */
  timelineFailUnderWeeks: number;
  /** At or above this passes. Between the two is unclear. */
  timelinePassFromWeeks: number;
  /** Approximate commercial size limit from services.md. */
  commercialMaxSqFt: number;
  /** Percent band around the limit that counts as borderline (unclear). */
  commercialBorderPct: number;
  /** What to do when criteria 1 to 3 are still unclear after the one allowed re-run. */
  unclearAfterRetry: "unqualified" | "qualified";
  /** Hours until a failed call must be called back. */
  callbackTargetMinutes: number;
  /** Offices up to this size are labelled "small office", above it "large office". */
  smallOfficeMaxSqFt: number;
}

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function int(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${key} must be a non-negative integer, got "${raw}"`);
  return n;
}

function oneOf<T extends string>(env: Record<string, string | undefined>, key: string, allowed: readonly T[], fallback: T): T {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  if (!(allowed as readonly string[]).includes(raw)) throw new Error(`${key} must be one of ${allowed.join(", ")}, got "${raw}"`);
  return raw as T;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const days = (env.BOOKABLE_DAYS || "Mon,Tue,Wed,Thu,Fri,Sat").split(",").map((d) => d.trim());
  const bookableDays = days.map((d) => {
    const idx = DAY_INDEX[d];
    if (idx === undefined) throw new Error(`BOOKABLE_DAYS has unknown day "${d}"`);
    return idx;
  });
  const cfg: Config = {
    knowledgeDir: env.KNOWLEDGE_DIR || "./knowledge",
    consultationMinutes: int(env, "CONSULTATION_MINUTES", 45),
    bookableStartHour: int(env, "BOOKABLE_START_HOUR", 10),
    bookableEndHour: int(env, "BOOKABLE_END_HOUR", 19),
    bookableDays,
    bookingLeadMinutes: int(env, "BOOKING_LEAD_MINUTES", 120),
    officeTz: env.OFFICE_TZ || "Asia/Kolkata",
    failPolicy: oneOf(env, "QUALIFY_FAIL_POLICY", ["any_clear_fail", "two_or_more"], "any_clear_fail"),
    timelineFailUnderWeeks: int(env, "TIMELINE_FAIL_UNDER_WEEKS", 6),
    timelinePassFromWeeks: int(env, "TIMELINE_PASS_FROM_WEEKS", 10),
    commercialMaxSqFt: int(env, "COMMERCIAL_MAX_SQFT", 3000),
    commercialBorderPct: int(env, "COMMERCIAL_BORDER_PCT", 10),
    unclearAfterRetry: oneOf(env, "UNCLEAR_AFTER_RETRY", ["unqualified", "qualified"], "unqualified"),
    callbackTargetMinutes: int(env, "CALLBACK_TARGET_MINUTES", 60),
    smallOfficeMaxSqFt: int(env, "SMALL_OFFICE_MAX_SQFT", 1500),
  };
  if (cfg.timelineFailUnderWeeks > cfg.timelinePassFromWeeks) {
    throw new Error("TIMELINE_FAIL_UNDER_WEEKS must not exceed TIMELINE_PASS_FROM_WEEKS");
  }
  if (cfg.officeTz !== "Asia/Kolkata") {
    // Slot maths uses a fixed +05:30 offset (India has no DST). Other zones need a real tz library.
    throw new Error(`OFFICE_TZ "${cfg.officeTz}" is not supported yet. Only Asia/Kolkata.`);
  }
  if (cfg.consultationMinutes === 0) throw new Error("CONSULTATION_MINUTES must be above 0");
  if (cfg.bookableStartHour >= cfg.bookableEndHour || cfg.bookableEndHour > 24) {
    throw new Error("BOOKABLE_START_HOUR must be below BOOKABLE_END_HOUR (max 24)");
  }
  return cfg;
}
