import { costCounts } from "../../src/server/queries";
import { loadCostConfig, summariseCost } from "../../src/lib/cost";
import { db } from "../../src/server/runtime";

const inr = (v: number | null) => (v === null ? "not set" : `Rs ${Math.round(v).toLocaleString("en-IN")}`);

/** Studio economics from configuration only. Every figure is labelled Indicative. None of it is a price quoted to a client. */
export async function Cost() {
  const cfg = loadCostConfig();
  const counts = await costCounts(db(), 30);
  const s = summariseCost(cfg, counts);
  const hub = cfg.hubspotPortalId ? `https://app.hubspot.com/contacts/${cfg.hubspotPortalId}/objects/0-3/views/all/list` : "https://app.hubspot.com/";
  return (
    <section>
      <h2>Cost and value <span className="chip warn">Indicative</span> <span className="muted small">last 30 days</span></h2>
      <div className="grid">
        <div className="card"><span className="label">Calls handled</span><h3 className="big">{counts.calls}</h3><span className="small muted">{counts.qualified} qualified</span></div>
        <div className="card"><span className="label">Cost per call</span><h3 className="big">{inr(cfg.costPerCallInr)}</h3><span className="small muted">Indicative · total {inr(s.totalCostInr)}</span></div>
        <div className="card"><span className="label">Cost per qualified lead</span><h3 className="big">{inr(s.costPerQualifiedLeadInr)}</h3><span className="small muted">Indicative</span></div>
        <div className="card"><span className="label">Value per qualified lead</span><h3 className="big">{inr(s.valuePerQualifiedLeadInr)}</h3><span className="small muted">Indicative · project value range × conversion share · total {inr(s.totalIndicativeValueInr)}</span></div>
        <div className="card"><span className="label">HubSpot deals</span><h3 className="big">{counts.hubspotDeals}</h3><a href={hub} target="_blank" rel="noreferrer">Open HubSpot deals</a></div>
      </div>
      {s.missing.length > 0 && <p className="banner">Not set yet: {s.missing.join(", ")}. Add them as environment variables on Vercel. Nothing is guessed.</p>}
    </section>
  );
}
