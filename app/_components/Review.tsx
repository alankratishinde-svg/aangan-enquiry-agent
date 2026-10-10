import { convertReview, deleteReview, markReviewed } from "../actions";
import { ago, istDateTime, pretty } from "../../src/server/format";
import { pendingReview, type ReviewItem } from "../../src/server/queries";
import { calcom, db } from "../../src/server/runtime";

const reasonLine = (r: ReviewItem["reasons"][number]) => {
  switch (r.type) {
    case "unqualified": {
      const crit = (r.criteria as { criterion: string; status: string; evidence: string }[] | undefined) ?? [];
      return (
        <div>
          <span className="chip bad">Did not qualify</span> {r.decline_reason ? <span className="small">{String(r.decline_reason)}</span> : null}
          <ul className="clean small">{crit.map((c, i) => (<li key={i}><strong>{pretty(c.criterion)}</strong>: {c.status}. <span className="muted">{c.evidence}</span></li>))}</ul>
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
  const comp = items.filter((i) => i.kind === "compliance");
  return (
    <section id="review">
      <h2>Needs review <span className="muted small">{unq.length} to decide · {comp.length} flagged</span></h2>
      {error && <p className="banner" role="alert">{error}</p>}

      <h3>Unqualified leads</h3>
      <p className="muted small">Nothing here is deleted by itself. Delete removes the caller's details. To convert, call the person back first, collect their email, then pick a time.</p>
      {unq.length === 0 && <div className="card"><p>Nothing waiting.</p></div>}
      {unq.map((i) => (
        <article className="card" key={i.reviewId}>
          <div className="row"><h3>{i.name ?? "Unnamed caller"} · {pretty(i.projectType)}{i.location ? ` · ${i.location}` : ""}</h3><span className="muted small">{istDateTime(i.startedAt)} ({ago(i.startedAt)})</span></div>
          <p className="small">Phone: {i.phone ?? "not captured"}{i.summary ? ` · ${i.summary}` : ""}</p>
          {i.reasons.map((r, k) => (<div key={k}>{reasonLine(r)}</div>))}
          {i.transcript && <details><summary>Transcript</summary><pre>{i.transcript}</pre></details>}
          <div className="row" style={{ alignItems: "flex-start", marginTop: 10 }}>
            <form action={convertReview} className="stack">
              <input type="hidden" name="id" value={i.reviewId} />
              <strong>Convert to a real lead</strong>
              <label className="small">Email (collected on the callback)<br /><input type="email" name="email" required autoComplete="off" /></label>
              <label className="small">Phone (optional)<br /><input type="tel" name="phone" defaultValue={i.phone ?? ""} /></label>
              <label className="small">Consultation time<br />
                <select name="slot" defaultValue="">
                  <option value="">No time yet, designer will arrange</option>
                  {slots.map((s) => (<option key={s} value={s}>{istDateTime(s)}</option>))}
                </select>
              </label>
              <button className="primary">Convert and assign a designer</button>
            </form>
            <form action={deleteReview}><input type="hidden" name="id" value={i.reviewId} /><button className="danger">Delete</button></form>
          </div>
        </article>
      ))}

      <h3>Calls flagged for what the agent did</h3>
      {comp.length === 0 && <div className="card"><p>No flagged calls.</p></div>}
      {comp.map((i) => (
        <article className="card" key={i.reviewId}>
          <div className="row"><h3>{i.name ?? "Unnamed caller"} · {pretty(i.projectType)}</h3><span className="muted small">{istDateTime(i.startedAt)}</span></div>
          {i.reasons.map((r, k) => (<div key={k}>{reasonLine(r)}</div>))}
          {i.transcript && <details><summary>Transcript</summary><pre>{i.transcript}</pre></details>}
          <form action={markReviewed}><input type="hidden" name="id" value={i.reviewId} /><button>Mark reviewed</button></form>
        </article>
      ))}
    </section>
  );
}
