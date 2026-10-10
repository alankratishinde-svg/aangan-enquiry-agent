import { safeText } from "../../src/lib/display";
import { istDateTime, pretty } from "../../src/server/format";
import type { CallDetail } from "../../src/server/queries";

/** One call: summary, transcript, the verdict by criterion, and the flags. Money figures are hidden. */
export function CallView({ call }: { call: CallDetail }) {
  const crit = Object.entries(call.verdict?.criteria ?? {});
  return (
    <section>
      <h2>Call · {istDateTime(call.startedAt)}</h2>
      <p>
        <span className={`chip ${call.status === "qualified" ? "ok" : call.status === "failed" ? "bad" : "warn"}`}>{call.status}</span>{" "}
        {call.designerName && <span className="chip">{call.designerName}</span>} {call.callerNumber && <span className="muted small">{call.callerNumber}</span>}
      </p>
      {call.summary && <div className="card"><span className="label">Summary</span><p>{safeText(call.summary)}</p></div>}
      <div className="card">
        <span className="label">Verdict</span>
        {crit.length === 0 ? <p className="muted">{call.failureReason ? safeText(call.failureReason) : "No verdict stored for this call."}</p> : (
          <ul className="clean small">{crit.map(([k, v]) => (<li key={k}><strong>{pretty(k)}</strong>: {v.status}. <span className="muted">{safeText(v.evidence)}</span></li>))}</ul>
        )}
        {call.verdict?.decline_reason && <p className="small">Decline reason: {safeText(call.verdict.decline_reason)}</p>}
        {(call.verdict?.handoff_notes?.length ?? 0) > 0 && (<><span className="label">Notes</span><ul className="clean small">{call.verdict!.handoff_notes!.map((n, i) => (<li key={i}>• {safeText(n)}</li>))}</ul></>)}
      </div>
      <div className="card">
        <span className="label">Flags</span>
        <p>
          {call.priceSpoken ? <span className="chip bad">The agent said a price</span> : <span className="chip ok">No price said</span>}{" "}
          {call.bookingBeforeQualified ? <span className="chip warn">Booked before qualified</span> : <span className="chip ok">No early booking</span>}
        </p>
      </div>
      <div className="card"><span className="label">Transcript</span>{call.transcript ? <pre>{safeText(call.transcript)}</pre> : <p className="muted">No transcript stored.</p>}</div>
    </section>
  );
}
