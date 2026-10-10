import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Aangan phone enquiries</h1>
      <p className="muted">Every call is answered, qualified and booked by the voice agent. Pick your view.</p>
      <div className="card"><h3><Link href="/designer">Designer dashboard</Link></h3><p className="muted small">Your qualified leads, with the booked time, an internal estimate, two add-on ideas and a progress meter. Sign in with the link from your lead email.</p></div>
      <div className="card"><h3><Link href="/frontdesk">Front desk</Link></h3><p className="muted small">Review queue (delete or convert), flagged calls, and the callback list with its one hour target.</p></div>
      <div className="card"><h3><Link href="/nikhil">Nikhil</Link></h3><p className="muted small">This week's numbers, what to improve, and rubric changes waiting for your approval.</p></div>
    </>
  );
}
