import type { EmailMessage } from "../email";
import { ESTIMATE_LABEL } from "./estimate";

export interface EmailLead {
  designerName: string;
  designerEmail: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  projectType: string | null;
  areaSqFt: number | null;
  location: string | null;
  neededBy: string | null;
  clientSize: string | null;
  summary: string | null;
  bookedSlotIst: string | null;
  handoffNotes: string[];
  estimateText: string;
  dashboardUrl: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pretty = (s: string | null) => (s ? s.replace(/_/g, " ") : "not given");

/** Short, scannable. The estimate appears only with its internal label. */
export function buildDesignerEmail(l: EmailLead): EmailMessage {
  const subject = `New lead: ${pretty(l.projectType)}${l.areaSqFt ? `, ${l.areaSqFt} sq ft` : ""}${l.location ? `, ${l.location}` : ""}`;
  const rows: [string, string][] = [
    ["Wants", l.summary ?? pretty(l.projectType)],
    ["Client size", l.clientSize ?? "not known"],
    ["Location", l.location ?? "not given"],
    ["Needed by", l.neededBy ?? "not given"],
    ["Contact", [l.name, l.phone, l.email].filter(Boolean).join(", ") || "not given"],
    ["Consultation", l.bookedSlotIst ?? "No booking found yet. Please arrange a time."],
    ["Internal estimate", l.estimateText.includes(ESTIMATE_LABEL) ? l.estimateText : `${l.estimateText} (${ESTIMATE_LABEL})`],
  ];
  const notes = l.handoffNotes.length ? l.handoffNotes : ["None."];
  const text = [`Hi ${l.designerName},`, "", "A new qualified lead is assigned to you.", "", ...rows.map(([k, v]) => `${k}: ${v}`), "", "Notes and uncertainties:", ...notes.map((n) => `- ${n}`), "", `Open the lead: ${l.dashboardUrl}`].join("\n");
  const html = `<p>Hi ${esc(l.designerName)},</p><p>A new qualified lead is assigned to you.</p><table cellpadding="4">${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table><p><b>Notes and uncertainties</b></p><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul><p><a href="${esc(l.dashboardUrl)}">Open the lead</a></p>`;
  return { to: l.designerEmail, subject, text, html };
}
