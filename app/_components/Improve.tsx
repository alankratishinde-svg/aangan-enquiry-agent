import { generateImprovement } from "../actions";
import { safeText } from "../../src/lib/display";
import { latestWeekly } from "../../src/server/queries";
import { db } from "../../src/server/runtime";

/** What can be improved for the unqualified leads, written by Gemini Flash from the stored reasons and decisions. */
export async function Improve() {
  const w = await latestWeekly(db());
  return (
    <section>
      <h2>What can be improved for unqualified leads</h2>
      {w ? (<div className="card"><p className="muted small">Week of {w.weekStart}, written by Gemini Flash from the stored reasons and decisions.</p><pre>{safeText(w.summary)}</pre></div>) : <div className="card"><p>No suggestions yet. The weekly job writes the first on Monday, or press the button.</p></div>}
      <form action={generateImprovement}><button className="primary">Write fresh suggestions from the last 7 days</button></form>
    </section>
  );
}
