import { SubNav } from "../_components/SubNav";
import { requireTeam } from "../../src/server/session";

export default async function NikhilLayout({ children }: { children: React.ReactNode }) {
  await requireTeam();
  return (
    <>
      <div className="toolbar">
        <strong>Nikhil dashboard</strong>
        <SubNav items={[
          { href: "/nikhil", label: "Overview" }, { href: "/nikhil/review", label: "Review" }, { href: "/nikhil/callbacks", label: "Callbacks" },
          { href: "/nikhil/flags", label: "Flags" }, { href: "/nikhil/rubric", label: "Rubric" }, { href: "/nikhil/cost", label: "Cost" }, { href: "/nikhil/improve", label: "Improve" },
        ]} />
      </div>
      {children}
    </>
  );
}
