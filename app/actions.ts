"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ConvertError, convertLead } from "../src/lib/leads/convert";
import { setRequirement, markCalledBack, resolveReview, decideProposal } from "../src/server/queries";
import { calcom, config, db, email, gemini, hubspot, store } from "../src/server/runtime";
import { cookies } from "next/headers";
import { runImprove } from "../src/lib/weekly";
import { DESIGNER_COOKIE } from "../src/server/designer";
import { activeDesigners } from "../src/server/queries";
import { clearSession, currentRole, openAccess, passwordOk, requireTeam, setSession } from "../src/server/session";
import { loadKnowledge } from "../src/lib/knowledge";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Tick or untick a checklist item for the selected designer. */
export async function toggleRequirement(form: FormData) {
  const role = await currentRole();
  const fromCookie = (await cookies()).get(DESIGNER_COOKIE)?.value ?? null;
  const designerId = !openAccess() && role?.kind === "designer" ? role.designerId : fromCookie;
  if (!designerId) redirect("/designer");
  await setRequirement(db(), designerId, str(form, "id"), str(form, "delivered") === "true");
  revalidatePath("/designer", "layout");
}

/** Designer dropdown: remember the choice in a cookie. The id must be an active designer from the database. */
export async function selectDesigner(form: FormData) {
  const id = str(form, "designer");
  const next = str(form, "next");
  if ((await activeDesigners(db())).some((d) => d.id === id)) {
    (await cookies()).set(DESIGNER_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  }
  redirect(next.startsWith("/designer") && !next.includes("//") ? next : "/designer");
}

/** Improve page: ask Gemini Flash for fresh suggestions from the last 7 days. */
export async function generateImprovement() {
  await requireTeam();
  await runImprove(db(), gemini());
  revalidatePath("/nikhil/improve");
}

/** Used only when OPEN_ACCESS is off. */
export async function teamLogin(form: FormData) {
  if (!passwordOk(str(form, "password"), process.env.TEAM_PASSWORD)) redirect("/login?error=1");
  await setSession({ kind: "frontdesk" });
  redirect("/");
}
export async function logout() {
  await clearSession();
  redirect("/");
}

export async function deleteReview(form: FormData) {
  await requireTeam();
  await resolveReview(db(), str(form, "id"), "delete", "front desk");
  revalidatePath("/nikhil", "layout");
}
export async function markReviewed(form: FormData) {
  await requireTeam();
  await resolveReview(db(), str(form, "id"), "reviewed", "front desk");
  revalidatePath("/nikhil", "layout");
}
export async function calledBack(form: FormData) {
  await requireTeam();
  await markCalledBack(db(), str(form, "id"));
  revalidatePath("/nikhil", "layout");
}

export async function convertReview(form: FormData) {
  await requireTeam();
  const cfg = config();
  let error = "";
  try {
    await convertLead(
      db(),
      { reviewId: str(form, "id"), email: str(form, "email"), phone: str(form, "phone") || null, slotIso: str(form, "slot") || null, by: "front desk" },
      {
        store: store(), config: cfg, gemini: gemini(), knowledge: await loadKnowledge(cfg.knowledgeDir), calcom: calcom(), email: email(),
        hubspot: hubspot(), dashboardBaseUrl: process.env.APP_BASE_URL,
      },
    );
  } catch (err) {
    error = err instanceof ConvertError ? err.message : `Could not convert: ${(err as Error).message.slice(0, 160)}`;
  }
  revalidatePath("/nikhil", "layout");
  if (error) redirect(`/nikhil/review?error=${encodeURIComponent(error)}`);
}

export async function approveProposal(form: FormData) {
  await requireTeam();
  await decideProposal(db(), str(form, "id"), "approved", "Nikhil");
  revalidatePath("/nikhil", "layout");
}
export async function rejectProposal(form: FormData) {
  await requireTeam();
  await decideProposal(db(), str(form, "id"), "rejected", "Nikhil");
  revalidatePath("/nikhil", "layout");
}
