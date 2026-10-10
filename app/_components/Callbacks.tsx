import { calledBack } from "../actions";
import { ago, istDateTime } from "../../src/server/format";
import { callbackList } from "../../src/server/queries";
import { db } from "../../src/server/runtime";

export async function Callbacks() {
  const { open, recent } = await callbackList(db());
  return (
    <section id="callbacks">
      <h2>Callbacks <span className="muted small">target: within one hour</span></h2>
      {open.length === 0 && <div className="card"><p>No failed calls waiting.</p></div>}
      {open.map((c) => (
        <article className="card" key={c.callId}>
          <div className="row"><h3>{c.callerNumber ?? "Number not captured"}</h3>{c.overdue ? <span className="chip bad">Overdue</span> : <span className="chip warn">Due {c.dueAt ? istDateTime(c.dueAt) : "soon"}</span>}</div>
          <p className="small muted">Call at {istDateTime(c.startedAt)} ({ago(c.startedAt)}). {c.reason}</p>
          <form action={calledBack}><input type="hidden" name="id" value={c.callId} /><button className="primary">Mark called back</button></form>
        </article>
      ))}
      {recent.length > 0 && (<><h3>Called back, last 7 days ({recent.length})</h3><table><tbody>{recent.map((c) => (<tr key={c.callId}><td>{c.callerNumber ?? "-"}</td><td>{istDateTime(c.startedAt)}</td><td>{c.calledBackAt && c.dueAt && new Date(c.calledBackAt) <= new Date(c.dueAt) ? "within the hour" : "late"}</td></tr>))}</tbody></table></>)}
    </section>
  );
}
