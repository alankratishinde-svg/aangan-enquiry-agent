import { redirect } from "next/navigation";

/** The separate dashboards were merged into one. */
export default function Page() {
  redirect("/#leads");
}
