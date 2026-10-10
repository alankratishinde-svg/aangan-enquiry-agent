import { redirect } from "next/navigation";

/** Old address. The review queue now lives under the Nikhil dashboard. */
export default function Page() {
  redirect("/nikhil/review");
}
