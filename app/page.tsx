import Image from "next/image";
import Link from "next/link";
import { homeCounts } from "../src/server/queries";
import { db } from "../src/server/runtime";

const DESIGNER_PAGES = [
  { href: "/designer/leads", label: "My leads", hint: "Notes, booked time, progress, two ideas to offer" },
  { href: "/designer/consultations", label: "Consultations", hint: "Upcoming bookings" },
];
const NIKHIL_PAGES = [
  { href: "/nikhil", label: "Overview", hint: "Calls, answers, response time" },
  { href: "/nikhil/review", label: "Review", hint: "Delete or convert" },
  { href: "/nikhil/callbacks", label: "Callbacks", hint: "Failed calls, one hour" },
  { href: "/nikhil/flags", label: "Flags", hint: "Price said, booked early" },
  { href: "/nikhil/rubric", label: "Rubric", hint: "Changes to approve" },
  { href: "/nikhil/cost", label: "Cost", hint: "Indicative figures" },
  { href: "/nikhil/improve", label: "Improve", hint: "What to change" },
];

export default async function Home() {
  const c = await homeCounts(db());
  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-img"><Image src="/hero-lounge.jpg" alt="A burnt-orange lounge chair against a green wall with a sculpted wave relief" fill priority sizes="(max-width: 1200px) 100vw, 1180px" /></div>
        <div className="hero-copy">
          <h1 id="home-title"><span><i>Every call +</i></span><span><i>every lead</i></span></h1>
          <p>Aangan Studio's phone line, answered at any hour. Each enquiry is qualified, booked with a designer, and kept in one place.</p>
        </div>
        <div className="glass" role="group" aria-label="Today">
          <div><b>Calls today</b><span className="num">{c.callsToday}</span><span className="small">Answered by the agent</span></div>
          <div><b>Qualified</b><span className="num">{c.qualifiedToday}</span><span className="small">Ready for a designer</span></div>
          <div><b>Waiting for review</b><span className="num">{c.waitingForReview}</span><span className="small">Needs a decision</span></div>
          <Link href="/nikhil/review" className="btn" style={{ background: "#17211b", color: "#fbf8f1", borderColor: "#17211b", textDecoration: "none" }}>Open review</Link>
        </div>
      </section>

      <div className="bigcards">
        <section className="card bigcard">
          <h2><Link href="/designer">Designer dashboard</Link></h2>
          <p className="muted small">Pick your name and see your own leads and consultations.</p>
          <ul className="clean">{DESIGNER_PAGES.map((p) => (<li key={p.href}><Link href={p.href}>{p.label}</Link><span className="muted small">{p.hint}</span></li>))}</ul>
        </section>
        <section className="card bigcard">
          <h2><Link href="/nikhil">Nikhil dashboard</Link></h2>
          <p className="muted small">Numbers, reviews, flags and the rubric, for Nikhil and the front desk.</p>
          <ul className="clean">{NIKHIL_PAGES.map((p) => (<li key={p.href}><Link href={p.href}>{p.label}</Link><span className="muted small">{p.hint}</span></li>))}</ul>
        </section>
      </div>
    </>
  );
}
