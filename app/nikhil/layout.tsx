import { PageHero } from "../_components/PageHero";
import { SubNav } from "../_components/SubNav";
import { requireTeam } from "../../src/server/session";

export default async function NikhilLayout({ children }: { children: React.ReactNode }) {
  await requireTeam();
  return (
    <>
      <PageHero title="Nikhil dashboard" intro="How the phone line is doing, what needs a decision, and what to improve.">
        <SubNav items={[
          { href: "/nikhil", label: "Overview" }, { href: "/nikhil/review", label: "Review" }, { href: "/nikhil/callbacks", label: "Callbacks" },
          { href: "/nikhil/flags", label: "Flags" }, { href: "/nikhil/rubric", label: "Rubric" }, { href: "/nikhil/cost", label: "Cost" }, { href: "/nikhil/improve", label: "Improve" },
        ]} />
      </PageHero>
      <div className="content">{children}</div>
    </>
  );
}
