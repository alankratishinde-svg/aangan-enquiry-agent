import Link from "next/link";
import { designerContext } from "../../src/server/designer";
import { designerLeads, upcomingConsultations } from "../../src/server/queries";
import { db } from "../../src/server/runtime";

export default async function DesignerHome() {
  const { selected } = await designerContext();
  if (!selected) return null; // the layout shows the prompt
  const [leads, next] = await Promise.all([designerLeads(db(), selected.id), upcomingConsultations(db(), selected.id)]);
  return (
    <>
      <h1>Hello, {selected.name}</h1>
      <div className="grid">
        <div className="card"><span className="label">Your leads</span><h3 className="big">{leads.length}</h3><Link href="/designer/leads">Open leads</Link></div>
        <div className="card"><span className="label">Upcoming consultations</span><h3 className="big">{next.length}</h3><Link href="/designer/consultations">Open consultations</Link></div>
      </div>
    </>
  );
}
