"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ConvertError, convertLead } from "../src/lib/leads/convert";
import { setRequirement, markCalledBack, resolveReview, decideProposal } from "../src/server/queries";
import { calcom, config, db, email, gemini, hubspot, store } from "../src/server/runtime";
import { clearSession, passwordOk, requireDashboard, requireTeam, setSession } from "../src/server/session";
import { loadKnowledge } from "../src/lib/knowledge";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function toggleRequirement(form: FormData) {
  const me = await requireDashboard();
  await setRequirement(db(), me.scope === "designer" ? me.designerId : null, str(form, "id"), str(form, "delivered") === "true");
  revalidatePath("/");
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
  revalidatePath("/");
}
export async function markReviewed(form: FormData) {
  await requireTeam();
  await resolveReview(db(), str(form, "id"), "reviewed", "front desk");
  revalidatePath("/");
}
export async function calledBack(form: FormData) {
  await requireTeam();
  await markCalledBack(db(), str(form, "id"));
  revalidatePath("/");
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
  revalidatePath("/");
  if (error) redirect(`/?error=${encodeURIComponent(error)}#review`);
}

export async function approveProposal(form: FormData) {
  await requireTeam();
  await decideProposal(db(), str(form, "id"), "approved", "Nikhil");
  revalidatePath("/");
}
export async function rejectProposal(form: FormData) {
  await requireTeam();
  await decideProposal(db(), str(form, "id"), "rejected", "Nikhil");
  revalidatePath("/");
}
