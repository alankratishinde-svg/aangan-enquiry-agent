import type { CalendarAdapter } from "./calendar";
import type { Config } from "./config";
import type { DesignerSource } from "./designers";
import { buildInstructions, toBundleSlot, type BundleSlot } from "./instructions";
import { loadKnowledge, type Knowledge } from "./knowledge";
import { extractDeflection } from "./pricing";
import { findFreeSlots, generateSlotGrid, isAfterHours } from "./slots";

export interface ContextBundle {
  generatedAt: string;
  isAfterHours: boolean;
  knowledge: Knowledge;
  deflection: string;
  slots: BundleSlot[];
  /** Full agent instructions, ready to hand to the voice layer at call start. */
  instructions: string;
}

export interface BundleDeps {
  config: Config;
  designers: DesignerSource;
  calendar: CalendarAdapter;
  now?: () => Date;
  /** Max distinct consultation times offered to the agent. */
  maxSlots?: number;
}

export class ContextLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ContextLoadError";
  }
}

/**
 * Everything the agent needs before its first word: the three knowledge files
 * (read fresh from disk), the deflection line, and the next free consultation
 * slots. Any failure throws ContextLoadError so the caller can mark the call
 * failed instead of starting it half-informed (hard rule 3).
 */
export async function buildContextBundle(deps: BundleDeps): Promise<ContextBundle> {
  const now = (deps.now ?? (() => new Date()))();
  const maxSlots = deps.maxSlots ?? 8;
  try {
    const [knowledge, designers] = await Promise.all([
      loadKnowledge(deps.config.knowledgeDir),
      deps.designers.listActive(),
    ]);
    const deflection = extractDeflection(knowledge.pricing);

    const grid = generateSlotGrid(now, deps.config);
    const free = await findFreeSlots(designers, deps.calendar, grid);
    const seen = new Set<number>();
    const slots: BundleSlot[] = [];
    for (const s of free) {
      const t = s.start.getTime();
      if (seen.has(t)) continue;
      seen.add(t);
      slots.push(toBundleSlot(s));
      if (slots.length >= maxSlots) break;
    }

    const afterHours = isAfterHours(now, deps.config);
    const instructions = buildInstructions({ knowledge, slots, now, isAfterHours: afterHours });
    return { generatedAt: now.toISOString(), isAfterHours: afterHours, knowledge, deflection, slots, instructions };
  } catch (err) {
    throw new ContextLoadError(`Could not build call context: ${(err as Error).message}`, { cause: err });
  }
}
