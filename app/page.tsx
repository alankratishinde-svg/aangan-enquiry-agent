import Link from "next/link";
import { homeCounts } from "../src/server/queries";
import { db } from "../src/server/runtime";

const DESIGNER_PAGES = [
  { href: "/designer/leads", label: "My leads", hint: "Qualified leads with notes, booked time, progress and ideas" },
  { href: "/designer/consultations", label: "Consultations", hint: "Upcoming Cal.com bookings" },
];
const NIKHIL_PAGES = [
  { href: "/nikhil", label: "Overview", hint: "Calls, qualified, answered, response time" },
  { href: "/nikhil/review", label: "Review", hint: "Unqualified leads: delete or convert" },
  { href: "/nikhil/callbacks", label: "Callbacks", hint: "Failed calls, one-hour target" },
  { href: "/nikhil/flags", label: "Flags", hint: "Price said, booked too early" },
  { href: "/nikhil/rubric", label: "Rubric", hint: "Changes waiting for approval" },
  { href: "/nikhil/cost", label: "Cost", hint: "Indicative cost and value" },
  { href: "/nikhil/improve", label: "Improve", hint: "Suggestions for unqualified leads" },
];

export default async function Home() {
  const c = await homeCounts(db());
  return (
    <>
      <h1>Aangan Studio</h1>
      <p className="status" aria-label="Today">
        <strong>{c.callsToday}</strong> call{c.callsToday === 1 ? "" : "s"} today · <strong>{c.qualifiedToday}</strong> qualified · <strong>{c.waitingForReview}</strong> waiting for review
      </p>
      <div className="bigcards">
        <section className="card bigcard">
          <h2><Link href="/designer">Designer dashboard</Link></h2>
          <p className="muted small">For the designers. Pick your name and see your own leads.</p>
          <ul className="clean">{DESIGNER_PAGES.map((p) => (<li key={p.href}><Link href={p.href}>{p.label}</Link> <span className="muted small">{p.hint}</span></li>))}</ul>
        </section>
        <section className="card bigcard">
          <h2><Link href="/nikhil">Nikhil dashboard</Link></h2>
          <p className="muted small">For Nikhil and the front desk. Numbers, reviews, flags and the rubric.</p>
          <ul className="clean">{NIKHIL_PAGES.map((p) => (<li key={p.href}><Link href={p.href}>{p.label}</Link> <span className="muted small">{p.hint}</span></li>))}</ul>
        </section>
      </div>
    </>
  );
}
