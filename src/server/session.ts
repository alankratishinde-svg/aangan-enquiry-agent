import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { hashToken } from "./token";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./runtime";

export type Role = { kind: "designer"; designerId: string; name: string } | { kind: "frontdesk" } | { kind: "nikhil" };
const COOKIE = "aangan_session";
const TTL_MS = 12 * 3600 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) throw new Error("SESSION_SECRET must be set (24+ characters)");
  return s;
}
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mac = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function signSession(role: Role, now = Date.now()): string {
  const payload = b64(JSON.stringify({ role, exp: now + TTL_MS }));
  return `${payload}.${mac(payload)}`;
}

export function readSession(value: string | undefined, now = Date.now()): Role | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(mac(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { role, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { role: Role; exp: number };
    return exp > now ? role : null;
  } catch {
    return null;
  }
}

export async function setSession(role: Role): Promise<void> {
  (await cookies()).set(COOKIE, signSession(role), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TTL_MS / 1000 });
}
export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
export async function currentRole(): Promise<Role | null> {
  return readSession((await cookies()).get(COOKIE)?.value);
}

/**
 * TEST MODE. With OPEN_ACCESS=true the dashboard needs no password and shows the whole team's work. Turn it off
 * (remove the variable) before real customers call: it shows phone numbers and transcripts.
 */
export const openAccess = () => process.env.OPEN_ACCESS === "true";

/** Actions that touch the whole team's data (review, callbacks, rubric). Designers cannot. */
export async function requireTeam(): Promise<void> {
  if (openAccess()) return;
  const r = await currentRole();
  if (r?.kind !== "frontdesk") redirect("/login");
}

export function passwordOk(given: string, expected: string | undefined): boolean {
  if (!expected || expected.length < 8) return false;
  const a = Buffer.from(createHash("sha256").update(given).digest());
  const b = Buffer.from(createHash("sha256").update(expected).digest());
  return timingSafeEqual(a, b);
}

export async function designerByToken(token: string): Promise<{ id: string; name: string } | null> {
  const r = await db().query<{ id: string; name: string }>(`select id, name from designers where active and access_token_hash = $1`, [hashToken(token)]);
  return r.rows[0] ?? null;
}
