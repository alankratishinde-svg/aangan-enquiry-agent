import { approveProposal, logout, rejectProposal } from "../actions";
import { weekMetrics, weekStartIst } from "../../src/lib/metrics";
import { latestWeekly, proposals } from "../../src/server/queries";
import { db } from "../../src/server/runtime";
import { requireNikhil } from "../../src/server/session";

export default async function Nikhil() {
  await requireNikhil();
  const sql = db();
  const m = await weekMetrics(sql, weekStartIst(new Date()));
  const weekly = await latestWeekly(sql);
  const props = await proposals(sql);
  const pct = (v: number | null) => (v === null ? "no data" : `${v}%`);
  return (
    <>
      <div className="row"><div><h1>This week</h1><p className="muted">From Monday {m.weekStart}, India time.</p></div><form action={logout}><button>Sign out</button></form></div>
      <div className="grid">
        <div className="card"><span className="label">Calls</span><h2 style={{ margin: 0 }}>{m.counts.total}</h2><span className="small muted">{m.counts.qualified} qualified · {m.counts.unqualified} unqualified · {m.counts.failed} failed</span></div>
        <div className="card"><span className="label">Answered within 5 min</span><h2 style={{ margin: 0 }}>{pct(m.response.underFiveMinutesPct)}</h2><span className="small muted">median {m.response.medianSeconds ?? "no data"} s</span></div>
        <div className="card"><span className="label">Failed calls called back in 1 hour</span><h2 style={{ margin: 0 }}>{pct(m.failed.withinHourPct)}</h2><span className="small muted">{m.failed.calledBackWithinHour} of {m.failed.total} · {m.failed.overdue} overdue · median {m.failed.medianMinutesToCallback ?? "no data"} min</span></div>
        <div className="card"><span className="label">Agent flags</span><h2 style={{ margin: 0 }}>{m.flags.priceSpoken + m.flags.bookingBeforeQualified}</h2><span className="small muted">{m.flags.priceSpoken} price said · {m.flags.bookingBeforeQualified} booked too early</span></div>
        <div className="card"><span className="label">Front desk</span><h2 style={{ margin: 0 }}>{m.review.converted} converted</h2><span className="small muted">{m.review.deleted} deleted · {m.review.pendingUnqualified + m.review.pendingCompliance} waiting</span></div>
      </div>

      <h2>What can be improved for unqualified leads</h2>
      {weekly ? (<div className="card"><p className="muted small">Week of {weekly.weekStart}, written by Gemini Flash from the stored reasons and decisions.</p><pre>{weekly.summary}</pre></div>) : <div className="card"><p>The first weekly summary is written on Monday.</p></div>}

      <h2>Rubric changes waiting for you</h2>
      <p className="muted small">Nothing changes the live rubric until you approve it. Approved changes are applied to the rubric file and synced to the voice agent by the studio's developer (npm run rubric:apply).</p>
      {props.length === 0 && <div className="card"><p>No proposals yet. A draft appears only when the front desk has converted at least two unqualified leads for a similar reason.</p></div>}
      {props.map((p) => (
        <article className="card" key={p.id}>
          <div className="row"><h3>Proposal</h3><span className={`chip ${p.state === "approved" ? "ok" : p.state === "rejected" ? "bad" : "warn"}`}>{p.state}{p.appliedAt ? ", applied" : ""}</span></div>
          <p>{p.rationale}</p>
          <details><summary>See the exact change</summary><pre>{p.diff}</pre></details>
          {p.state === "pending" && (
            <div className="row" style={{ justifyContent: "flex-start" }}>
              <form action={approveProposal}><input type="hidden" name="id" value={p.id} /><button className="primary">Approve</button></form>
              <form action={rejectProposal}><input type="hidden" name="id" value={p.id} /><button>Reject</button></form>
            </div>
          )}
        </article>
      ))}
    </>
  );
}
