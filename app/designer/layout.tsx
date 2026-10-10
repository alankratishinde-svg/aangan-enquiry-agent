import { DesignerPicker } from "../_components/DesignerPicker";
import { PageHero } from "../_components/PageHero";
import { SubNav } from "../_components/SubNav";
import { designerContext } from "../../src/server/designer";

export default async function DesignerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await designerContext();
  return (
    <>
      <PageHero title="Designer dashboard" intro="Your leads, consultations and progress, kept together.">
        <DesignerPicker designers={ctx.designers} selectedId={ctx.selected?.id ?? null} locked={ctx.locked} />
        <SubNav items={[{ href: "/designer", label: "Home" }, { href: "/designer/leads", label: "Leads" }, { href: "/designer/consultations", label: "Consultations" }]} />
      </PageHero>
      <div className="content">
        {ctx.selected ? children : (<div className="card empty"><h3>Choose a designer</h3><p className="muted">Pick your name in the bar above to see your leads and consultations.</p></div>)}
      </div>
    </>
  );
}
