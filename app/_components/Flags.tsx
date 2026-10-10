import Link from "next/link";
import { markReviewed } from "../actions";
import { istDateTime } from "../../src/server/format";
import { flaggedCalls } from "../../src/server/queries";
import { db } from "../../src/server/runtime";

/** Calls where the agent said a price or booked before the lead was qualified. The price itself is never shown. */
export async function Flags() {
  const calls = await flaggedCalls(db());
  const open = calls.filter((c) => c.reviewState !== "reviewed");
  const done = calls.filter((c) => c.reviewState === "reviewed");
  const card = (c: (typeof calls)[number]) => (
    <article className="card" key={c.callId}>
      <div className="row"><h3>{c.name ?? "Unnamed caller"}</h3><span className="muted small">{istDateTime(c.startedAt)} · {c.status}</span></div>
      <p>
        {c.priceSpoken && <span className="chip bad">price_spoken</span>} {c.bookingBeforeQualified && <span className="chip warn">booked_before_qualified</span>}
      </p>
      {c.priceSpoken && (<p className="small">The agent named a price on turn{c.priceEvidence.length === 1 ? "" : "s"} {c.priceEvidence.length > 0 ? "recorded in the call" : "of the call"}. Open the call to read the conversation; money figures are hidden everywhere.</p>)}
      {c.bookingNote && <p className="small">{c.bookingNote} If the lead does not qualify, cancel the booking in Cal.com.</p>}
      <div className="row" style={{ justifyContent: "flex-start" }}>
        <Link href={`/nikhil/calls/${c.callId}`} className="btn">View the call</Link>
        {c.reviewId && c.reviewState === "pending" && (<form action={markReviewed}><input type="hidden" name="id" value={c.reviewId} /><button className="primary">Mark reviewed</button></form>)}
      </div>
    </article>
  );
  return (
    <section>
      <h2>Flagged calls <span className="muted small">{open.length} open</span></h2>
      {open.length === 0 && <div className="card"><p>No open flags.</p></div>}
      {open.map(card)}
      {done.length > 0 && (<><h3>Reviewed</h3>{done.map(card)}</>)}
    </section>
  );
}
