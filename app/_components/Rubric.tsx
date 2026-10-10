import { approveProposal, rejectProposal } from "../actions";
import { proposals } from "../../src/server/queries";
import { db } from "../../src/server/runtime";

export async function Rubric() {
  const props = await proposals(db());
  return (
    <section id="rubric">
      <h2>Rubric changes waiting for approval</h2>
      <p className="muted small">Nothing changes the live rubric until it is approved. Approved changes are applied to the rubric file and synced to the voice agent by the studio's developer (npm run rubric:apply).</p>
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
    </section>
  );
}
