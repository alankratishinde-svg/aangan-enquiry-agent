import { notFound } from "next/navigation";
import { CallView } from "../../../_components/CallView";
import { designerContext } from "../../../../src/server/designer";
import { callDetail } from "../../../../src/server/queries";
import { db } from "../../../../src/server/runtime";

export default async function DesignerCall({ params }: { params: Promise<{ id: string }> }) {
  const { selected } = await designerContext();
  const { id } = await params;
  if (!selected) return null;
  const call = await callDetail(db(), id, selected.id); // only calls on this designer's own leads
  if (!call) notFound();
  return <CallView call={call} />;
}
