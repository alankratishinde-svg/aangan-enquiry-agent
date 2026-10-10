import { NextResponse } from "next/server";
import { DESIGNER_COOKIE } from "../../../src/server/designer";
import { designerByToken, setSession } from "../../../src/server/session";
import { cookies } from "next/headers";

/** Designer sign-in: the link in their lead email carries a personal token. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (token) {
    const d = await designerByToken(token);
    if (d) {
      await setSession({ kind: "designer", designerId: d.id, name: d.name });
      (await cookies()).set(DESIGNER_COOKIE, d.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
      return NextResponse.redirect(new URL(`/designer/leads${url.searchParams.get("lead") ? `?lead=${encodeURIComponent(url.searchParams.get("lead")!)}` : ""}`, url.origin));
    }
  }
  return new NextResponse(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Designer sign-in</title><body style='font:16px system-ui;max-width:520px;margin:48px auto;padding:0 16px'><h1>Designer sign-in</h1><p>Open the personal link you were sent. It looks like <code>/designer/login?token=...</code>. Ask the front desk for a new link if yours does not work.</p></body>",
    { status: token ? 401 : 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
