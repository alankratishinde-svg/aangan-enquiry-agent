import { logout } from "./actions";
import { Callbacks } from "./_components/Callbacks";
import { Leads } from "./_components/Leads";
import { Overview } from "./_components/Overview";
import { Review } from "./_components/Review";
import { Rubric } from "./_components/Rubric";
import { openAccess, requireDashboard } from "../src/server/session";

/** The one dashboard: this week, leads, review queue, callbacks, rubric changes. A designer's link shows only their leads. */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ lead?: string; error?: string; designer?: string }> }) {
  const me = await requireDashboard();
  const { lead, error, designer } = await searchParams;
  if (me.scope === "designer") {
    return (
      <>
        <div className="row"><div><h1>Your leads</h1><p className="muted">Signed in as {me.name}.</p></div><form action={logout}><button>Sign out</button></form></div>
        <Leads designerId={me.designerId} focus={lead} />
      </>
    );
  }
  return (
    <>
      <div className="row">
        <div><h1>Aangan enquiries</h1><p className="muted">Everything in one place.{openAccess() ? " Test mode: no sign-in." : ""}</p></div>
        {!openAccess() && <form action={logout}><button>Sign out</button></form>}
      </div>
      <Overview />
      <Leads designerId={null} focus={lead} filter={designer} />
      <Review error={error} />
      <Callbacks />
      <Rubric />
    </>
  );
}
