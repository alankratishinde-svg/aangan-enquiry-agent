import { DesignerPicker } from "../_components/DesignerPicker";
import { SubNav } from "../_components/SubNav";
import { designerContext } from "../../src/server/designer";

export default async function DesignerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await designerContext();
  return (
    <>
      <div className="toolbar">
        <DesignerPicker designers={ctx.designers} selectedId={ctx.selected?.id ?? null} locked={ctx.locked} />
        <SubNav items={[{ href: "/designer", label: "Home" }, { href: "/designer/leads", label: "Leads" }, { href: "/designer/consultations", label: "Consultations" }]} />
      </div>
      {ctx.selected ? children : (<div className="card"><h2>Choose a designer</h2><p>Pick your name in the box above to see your leads and consultations.</p></div>)}
    </>
  );
}
