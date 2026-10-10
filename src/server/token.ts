import { createHash } from "node:crypto";
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
