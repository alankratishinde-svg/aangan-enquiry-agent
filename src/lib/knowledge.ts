import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const KNOWLEDGE_FILES = ["services.md", "pricing.md", "qualified.md"] as const;

export interface Knowledge {
  services: string;
  pricing: string;
  qualified: string;
}

/**
 * Read the three knowledge files from disk. Deliberately no cache: every call
 * sees the current file contents, so an edit takes effect on the next call.
 */
export async function loadKnowledge(dir: string): Promise<Knowledge> {
  const read = async (name: (typeof KNOWLEDGE_FILES)[number]) => {
    try {
      return await readFile(join(dir, name), "utf8");
    } catch (err) {
      throw new Error(`Knowledge file ${name} could not be read from ${dir}: ${(err as Error).message}`);
    }
  };
  const [services, pricing, qualified] = await Promise.all(KNOWLEDGE_FILES.map(read));
  return { services: services!, pricing: pricing!, qualified: qualified! };
}
