import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { activeDesigners, type DesignerOption } from "./queries";
import { db } from "./runtime";
import { currentRole, openAccess } from "./session";

export const DESIGNER_COOKIE = "aangan_designer";

export interface DesignerContext {
  designers: DesignerOption[];
  selected: DesignerOption | null;
  /** True when a personal link fixed the designer (test mode off). The dropdown is then read only. */
  locked: boolean;
}

/** Pure part, so it can be tested: which designer is selected, given the cookie, the DB list and the signed-in role. */
export function chooseDesigner(
  cookieValue: string | undefined,
  designers: DesignerOption[],
  role: { kind: string; designerId?: string } | null,
  open: boolean,
): { selected: DesignerOption | null; locked: boolean } {
  if (!open && role?.kind === "designer" && role.designerId) {
    const mine = designers.find((d) => d.id === role.designerId) ?? null;
    return { selected: mine, locked: true };
  }
  return { selected: designers.find((d) => d.id === cookieValue) ?? null, locked: false };
}

/** The Designer area: free dropdown in test mode, a personal link or the team sign-in otherwise. */
export async function designerContext(): Promise<DesignerContext> {
  const role = await currentRole();
  if (!openAccess() && role?.kind !== "designer" && role?.kind !== "frontdesk") redirect("/login");
  const designers = await activeDesigners(db());
  const c = chooseDesigner((await cookies()).get(DESIGNER_COOKIE)?.value, designers, role, openAccess());
  return { designers, ...c };
}
