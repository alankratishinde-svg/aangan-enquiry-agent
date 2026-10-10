import { convertReview, deleteReview, markReviewed } from "../actions";
import Link from "next/link";
import { safeText } from "../../src/lib/display";
import { ago, cap, istDateTime, pretty } from "../../src/server/format";
import { pendingReview, type ReviewItem } from "../../src/server/queries";
import { calcom, db } from "../../src/server/runtime";

const reasonLine = (r: ReviewItem["reasons"][number]) => {
  switch (r.type) {
    case "unqualified": {
      const crit = (r.criteria as { criterion: string; status: string; evidence: string }[] | undefined) ?? [];
      return (
        <div className="why">
          <div className="callout">
            <strong>Did not qualify</strong>
            {r.decline_reason ? <p>{safeText(String(r.decline_reason))}</p> : null}
          </div>
          <dl className="crit">
            {crit.map((c, i) => (
              <div key={i} className="crit-row">
                <dt>{cap(pretty(c.criterion))}</dt>
                <dd><span className={`state ${c.status}`}>{c.status === "fail" ? "Failed" : "Unclear"}</span><span className="crit-note">{safeText(c.evidence)}</span></dd>
              </div>
            ))}
          </dl>
        </div>
      );
    }
    case "price_spoken": {
      const hits = [...((r.regex_hits as { text: string }[] | undefined) ?? []).map((h) => h.text), ...((r.gemini_evidence as { quote: string }[] | undefined) ?? []).map((h) => h.quote)];
      return (<div><span className="chip bad">Agent said a price</span><ul className="clean small">{hits.slice(0, 4).map((h, i) => (<li key={i}>“{h}”</li>))}</ul></div>);
    }
    case "booking_before_qualified":
      return (<div><span className="chip warn">Booking before the lead was qualified</span> <span className="small muted">{r.booked_before_info_complete ? "The agent started booking before it had what, where and when. " : ""}{r.booked_while_not_qualified ? "The lead does not qualify but a booking was made. Cancel it in Cal.com if needed." : ""}</span></div>);
    case "declined_but_qualified":
      return (<div><span className="chip warn">Agent turned away a qualified caller</span> <span className="small muted">Call this person back.</span></div>);
    default:
      return <div className="chip">{r.type}</div>;
  }
};

export async function Review({ error }: { error?: string }) {
  const items = await pendingReview(db());
  let slots: string[] = [];
  try {
    const cal = calcom();
    if (cal && items.some((i) => i.kind === "unqualified")) {
      const now = Date.now();
      slots = (await cal.listSlots(new Date(now).toISOString(), new Date(now + 7 * 86_400_000).toISOString())).slice(0, 40);
    }
  } catch { /* the form still works without a slot */ }
  const unq = items.filter((i) => i.kind === "unqualified");
  return (
    <section id="review">
      <h2>Unqualified leads <span className="muted small">{unq.length} to decide</span></h2>
      {error && <p className="banner" role="alert">{error}</p>}

      <p className="muted small">Nothing here is deleted by itself. Delete removes the caller's details. To convert, call the person back first, collect their email, then pick a time.</p>
      {unq.length === 0 && <div className="card"><p>Nothing waiting.</p></div>}
      {unq.map((i) => (
        <article className="card case" key={i.reviewId}>
          <header className="case-head">
            <h3>{i.name ?? "Unnamed caller"}</h3>
            <p className="case-meta">
              {[cap(pretty(i.projectType)), i.location, i.phone ?? "No phone captured"].filter(Boolean).join("  ·  ")}
              <span className="case-time">{istDateTime(i.startedAt)}, {ago(i.startedAt)}</span>
            </p>
          </header>
          {i.summary && <p className="case-summary">{safeText(i.summary)}</p>}
          <div className="case-body">
            <div>
              {i.reasons.map((r, k) => (<div key={k}>{reasonLine(r)}</div>))}
              <p className="case-links">
                <Link href={`/nikhil/calls/${i.callId}`}>Read the full call</Link>
              </p>
              {i.transcript && <details><summary>Show transcript</summary><pre>{safeText(i.transcript)}</pre></details>}
            </div>
            <div className="decide">
              <form action={convertReview} className="stack">
                <input type="hidden" name="id" value={i.reviewId} />
                <h4>Convert to a real lead</h4>
                <p className="small muted">Call the person back first and collect their email.</p>
                <label className="small">Email<input type="email" name="email" required autoComplete="off" /></label>
                <label className="small">Phone, optional<input type="tel" name="phone" defaultValue={i.phone ?? ""} /></label>
                <label className="small">Consultation time
                  <select name="slot" defaultValue="">
                    <option value="">No time yet, designer will arrange</option>
                    {slots.map((s) => (<option key={s} value={s}>{istDateTime(s)}</option>))}
                  </select>
                </label>
                <button className="primary">Convert and assign a designer</button>
              </form>
              <form action={deleteReview} className="delete">
                <input type="hidden" name="id" value={i.reviewId} />
                <button className="danger">Delete this enquiry</button>
              </form>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
