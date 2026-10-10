import { redirect } from "next/navigation";

/** Old address. Callbacks now live under the Nikhil dashboard. */
export default function Page() {
  redirect("/nikhil/callbacks");
}
