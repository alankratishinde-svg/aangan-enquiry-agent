export interface Config {
  knowledgeDir: string;
  consultationMinutes: number;
  bookableStartHour: number;
  bookableEndHour: number;
  /** 0 = Sunday ... 6 = Saturday */
  bookableDays: number[];
  bookingLeadMinutes: number;
  officeTz: string;
}

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function int(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${key} must be a non-negative integer, got "${raw}"`);
  return n;
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
  };
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
