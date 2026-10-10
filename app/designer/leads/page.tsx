import { Leads } from "../../_components/Leads";
import { designerContext } from "../../../src/server/designer";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { selected } = await designerContext();
  const { lead } = await searchParams;
  if (!selected) return null;
  return <Leads designerId={selected.id} designerName={selected.name} focus={lead} />;
}
