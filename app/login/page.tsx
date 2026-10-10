import { redirect } from "next/navigation";
import { teamLogin } from "../actions";
import { openAccess } from "../../src/server/session";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (openAccess()) redirect("/");
  const { error } = await searchParams;
  return (
    <>
      <h1>Team sign-in</h1>
      {error && <p className="banner" role="alert">Wrong password.</p>}
      <form action={teamLogin} className="stack">
        <label>Password<br /><input type="password" name="password" autoComplete="current-password" required /></label>
        <button className="primary">Sign in</button>
      </form>
    </>
  );
}
