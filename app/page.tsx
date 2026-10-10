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
        <DashCard title="Designer dashboard" intro="Pick your name and see your own leads and consultations." pages={DESIGNER_PAGES} href="/designer" focus="62% 78%" />
        <DashCard title="Nikhil dashboard" intro="Numbers, reviews, flags and the rubric, for Nikhil and the front desk." pages={NIKHIL_PAGES} href="/nikhil" focus="14% 34%" />
      </div>
    </>
  );
}

/** One of the two entry cards: a crop of the room, the title, and each sub-page as a full-width row. */
function DashCard({ title, intro, pages, href, focus }: { title: string; intro: string; pages: { href: string; label: string; hint: string }[]; href: string; focus: string }) {
  return (
    <section className="card bigcard">
      <Link href={href} className="bigcard-img" aria-label={`Open the ${title}`} tabIndex={-1}>
        <Image src="/hero-lounge.jpg" alt="" fill sizes="(max-width: 760px) 100vw, 580px" style={{ objectPosition: focus }} />
      </Link>
      <div className="bigcard-body">
        <h2><Link href={href}>{title}</Link></h2>
        <p className="muted">{intro}</p>
        <ul className="rows">
          {pages.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="rowlink"><span className="rl-name">{p.label}</span><span className="rl-hint">{p.hint}</span><span className="rl-go" aria-hidden="true">›</span></Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
