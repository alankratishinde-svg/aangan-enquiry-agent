import Link from "next/link";
import { istDateTime, pretty } from "../../../src/server/format";
import { designerContext } from "../../../src/server/designer";
import { upcomingConsultations } from "../../../src/server/queries";
import { db } from "../../../src/server/runtime";

export default async function Consultations() {
  const { selected } = await designerContext();
  if (!selected) return null;
  const items = await upcomingConsultations(db(), selected.id);
  return (
    <section>
      <h2>Upcoming consultations <span className="muted small">{items.length} for {selected.name}</span></h2>
      {items.length === 0 && <div className="card"><p>No upcoming consultations booked on your leads.</p></div>}
      {items.map((c) => (
        <article className="card" key={c.leadId}>
          <div className="row"><h3>{istDateTime(c.bookedSlot)}</h3><span className="chip">45 min</span></div>
          <p>{c.name ?? "Name not given"} · {pretty(c.projectType)}{c.location ? ` · ${c.location}` : ""}</p>
          <p className="small muted">{c.phone ?? "no phone"} · {c.email ?? "no email"}</p>
          <Link href={`/designer/calls/${c.callId}`}>View the call</Link>
        </article>
      ))}
    </section>
  );
}
