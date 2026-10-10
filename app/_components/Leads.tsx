import { toggleRequirement } from "../actions";
import { ago, istDateTime, pretty } from "../../src/server/format";
import { leadsFor, progressPct } from "../../src/server/queries";
import { db } from "../../src/server/runtime";

export async function Leads({ designerId, focus, filter }: { designerId: string | null; focus?: string; filter?: string }) {
  const sql = db();
  const all = await leadsFor(sql, designerId);
  const designers = [...new Map(all.filter((l) => l.designerId).map((l) => [l.designerId!, l.designerName ?? "Designer"])).entries()];
  const leads = filter ? all.filter((l) => (filter === "none" ? !l.designerId : l.designerId === filter)) : all;
  return (
    <section id="leads">
      <div className="row">
        <h2>Leads <span className="muted small">{leads.length} shown</span></h2>
        {designerId === null && designers.length > 0 && (
          <form method="get" action="/" className="inline small">
            <label>Designer{" "}
              <select name="designer" defaultValue={filter ?? ""}>
                <option value="">Everyone</option>
                {designers.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
                <option value="none">Not assigned yet</option>
              </select>
            </label>{" "}
            <button>Show</button>
          </form>
        )}
      </div>
      {leads.length === 0 && <div className="card"><p>No leads yet. New qualified leads appear here and arrive by email.</p></div>}
      {leads.map((l) => {
        const pct = progressPct(l.requirements);
        return (
          <article key={l.id} id={`lead-${l.id}`} className="card" style={focus === l.id ? { outline: "2px solid var(--accent)" } : undefined}>
            <div className="row">
              <h3>{pretty(l.projectType)}{l.areaSqFt ? `, ${l.areaSqFt} sq ft` : ""}{l.location ? `, ${l.location}` : ""}</h3>
              <span>{l.clientSize && <span className="chip">{l.clientSize}</span>} <span className="chip">{l.designerName ?? "Not assigned"}</span> <span className="muted small">{ago(l.createdAt)}</span></span>
            </div>
            <p style={{ margin: "8px 0" }}><span className="label">Looking for</span><br />{l.summary ?? pretty(l.projectType)}</p>
            <div className="grid">
              <div><span className="label">Consultation</span><br />{l.bookedSlot ? istDateTime(l.bookedSlot) : <span className="chip warn">No time booked yet. Arrange one.</span>}</div>
              <div><span className="label">Needed by</span><br />{l.neededBy ?? "not given"}</div>
              <div><span className="label">Contact</span><br />{l.name ?? "name not given"}<br />{l.phone ?? "no phone"}<br />{l.email ?? "no email"}</div>
            </div>
            <div className="estimate"><span className="label">Estimate</span><br />{l.estimateText ?? "See pricing.md"}</div>
            {l.addOnTips.length > 0 && (
              <>
                <span className="label">Two ideas to offer</span>
                <div className="tips">{l.addOnTips.map((t, i) => (<div className="tip" key={i}><strong>{t.title}</strong><br /><span className="small muted">{t.detail}</span></div>))}</div>
              </>
            )}
            {l.handoffNotes.length > 0 && (<><span className="label">Notes and uncertainties</span><ul className="clean small">{l.handoffNotes.map((n, i) => (<li key={i}>• {n}</li>))}</ul></>)}
            <div style={{ marginTop: 12 }}>
              <div className="row"><span className="label">Progress</span><strong>{pct}%</strong></div>
              <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Delivered items"><span style={{ width: `${pct}%` }} /></div>
              {l.requirements.length === 0 ? <p className="muted small">No checklist items were captured from the call.</p> : (
                <ul className="clean">
                  {l.requirements.map((r) => (
                    <li key={r.id}>
                      <form action={toggleRequirement} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="delivered" value={String(!r.delivered)} />
                        <button aria-pressed={r.delivered} title={r.delivered ? "Mark not delivered" : "Mark delivered"}>{r.delivered ? "☑" : "☐"}</button>
                      </form>{" "}
                      <span style={r.delivered ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{r.item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
