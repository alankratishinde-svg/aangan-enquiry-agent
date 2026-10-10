import { notFound } from "next/navigation";
import { CallView } from "../../../_components/CallView";
import { callDetail } from "../../../../src/server/queries";
import { db } from "../../../../src/server/runtime";

export default async function NikhilCall({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await callDetail(db(), id, null);
  if (!call) notFound();
  return <CallView call={call} />;
}
