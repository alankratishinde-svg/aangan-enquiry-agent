import { weekMetrics, weekStartIst } from "../../src/lib/metrics";
import { latestWeekly } from "../../src/server/queries";
import { db } from "../../src/server/runtime";

export async function Overview() {
  const sql = db();
  const m = await weekMetrics(sql, weekStartIst(new Date()));
  const weekly = await latestWeekly(sql);
  const pct = (v: number | null) => (v === null ? "no data" : `${v}%`);
  return (
    <section id="overview">
      <h2>This week <span className="muted small">from Monday {m.weekStart}, India time</span></h2>
      <div className="grid">
        <div className="card"><span className="label">Calls</span><h3 className="big">{m.counts.total}</h3><span className="small muted">{m.counts.qualified} qualified · {m.counts.unqualified} unqualified · {m.counts.failed} failed</span></div>
        <div className="card"><span className="label">Answered within 5 min</span><h3 className="big">{pct(m.response.underFiveMinutesPct)}</h3><span className="small muted">median {m.response.medianSeconds ?? "no data"} s</span></div>
        <div className="card"><span className="label">Failed calls called back in 1 hour</span><h3 className="big">{pct(m.failed.withinHourPct)}</h3><span className="small muted">{m.failed.calledBackWithinHour} of {m.failed.total} · {m.failed.overdue} overdue · median {m.failed.medianMinutesToCallback ?? "no data"} min</span></div>
        <div className="card"><span className="label">Agent flags</span><h3 className="big">{m.flags.priceSpoken + m.flags.bookingBeforeQualified}</h3><span className="small muted">{m.flags.priceSpoken} price said · {m.flags.bookingBeforeQualified} booked too early</span></div>
        <div className="card"><span className="label">Front desk</span><h3 className="big">{m.review.converted} converted</h3><span className="small muted">{m.review.deleted} deleted · {m.review.pendingUnqualified + m.review.pendingCompliance} waiting</span></div>
      </div>
      <h3>What can be improved for unqualified leads</h3>
      {weekly ? (<div className="card"><p className="muted small">Week of {weekly.weekStart}, written by Gemini Flash from the stored reasons and decisions.</p><pre>{weekly.summary}</pre></div>) : <div className="card"><p>The first weekly summary is written on Monday.</p></div>}
    </section>
  );
}
