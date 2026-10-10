import { Review } from "../../_components/Review";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <Review error={error} />;
}
