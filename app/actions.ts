"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ConvertError, convertLead } from "../src/lib/leads/convert";
import { setRequirement, markCalledBack, resolveReview, decideProposal } from "../src/server/queries";
import { calcom, config, db, email, gemini, hubspot, store } from "../src/server/runtime";
import { clearSession, passwordOk, requireDesigner, requireFrontDesk, requireNikhil, setSession } from "../src/server/session";
import { loadKnowledge } from "../src/lib/knowledge";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function toggleRequirement(form: FormData) {
  const me = await requireDesigner();
  await setRequirement(db(), me.designerId, str(form, "id"), str(form, "delivered") === "true");
  revalidatePath("/designer");
}

export async function frontDeskLogin(form: FormData) {
  if (!passwordOk(str(form, "password"), process.env.FRONT_DESK_PASSWORD)) redirect("/frontdesk/login?error=1");
  await setSession({ kind: "frontdesk" });
  redirect("/frontdesk");
}
export async function nikhilLogin(form: FormData) {
  if (!passwordOk(str(form, "password"), process.env.NIKHIL_PASSWORD)) redirect("/nikhil/login?error=1");
  await setSession({ kind: "nikhil" });
  redirect("/nikhil");
}
export async function logout() {
  await clearSession();
  redirect("/");
}

export async function deleteReview(form: FormData) {
  await requireFrontDesk();
  await resolveReview(db(), str(form, "id"), "delete", "front desk");
  revalidatePath("/frontdesk");
}
export async function markReviewed(form: FormData) {
  await requireFrontDesk();
  await resolveReview(db(), str(form, "id"), "reviewed", "front desk");
  revalidatePath("/frontdesk");
}
export async function calledBack(form: FormData) {
  await requireFrontDesk();
  await markCalledBack(db(), str(form, "id"));
  revalidatePath("/frontdesk/callbacks");
}

export async function convertReview(form: FormData) {
  await requireFrontDesk();
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
  revalidatePath("/frontdesk");
  if (error) redirect(`/frontdesk?error=${encodeURIComponent(error)}`);
}

export async function approveProposal(form: FormData) {
  await requireNikhil();
  await decideProposal(db(), str(form, "id"), "approved", "Nikhil");
  revalidatePath("/nikhil");
}
export async function rejectProposal(form: FormData) {
  await requireNikhil();
  await decideProposal(db(), str(form, "id"), "rejected", "Nikhil");
  revalidatePath("/nikhil");
}
