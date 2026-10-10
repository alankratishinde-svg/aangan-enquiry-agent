import { weekMetrics, weekStartIst } from "../../src/lib/metrics";
import { db } from "../../src/server/runtime";

const TARGET_SECONDS = 300;

export async function Overview() {
  const m = await weekMetrics(db(), weekStartIst(new Date()));
  const pct = (v: number | null) => (v === null ? "no data" : `${v}%`);
  const avg = m.response.averageSeconds;
  return (
    <section>
      <h2>This week <span className="muted small">from Monday {m.weekStart}, India time</span></h2>
      <div className="grid">
        <div className="card stat"><span className="label">Calls</span><h3 className="big">{m.counts.total}</h3><span className="small muted">{m.counts.failed} failed</span></div>
        <div className="card stat"><span className="label">Qualified vs unqualified</span><h3 className="big">{m.counts.qualified} / {m.counts.unqualified}</h3><span className="small muted">qualified / unqualified</span></div>
        <div className="card stat"><span className="label">Share answered</span><h3 className="big">{pct(m.response.answeredPct)}</h3><span className="small muted">{m.response.answered} of {m.counts.total} calls · {pct(m.response.underFiveMinutesPct)} within 5 min</span></div>
        <div className="card stat">
          <span className="label">Average response</span><h3 className="big">{avg === null ? "no data" : `${avg} s`}</h3>
          <span className={`chip ${avg === null ? "" : avg < TARGET_SECONDS ? "ok" : "bad"}`}>{avg === null ? "target under 300 s" : avg < TARGET_SECONDS ? "on target (under 300 s)" : "over the 300 s target"}</span>
        </div>
      </div>
    </section>
  );
}
