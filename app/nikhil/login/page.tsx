import { nikhilLogin } from "../../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h1>Nikhil sign-in</h1>
      {error && <p className="banner" role="alert">Wrong password.</p>}
      <form action={nikhilLogin} className="stack">
        <label>Password<br /><input type="password" name="password" autoComplete="current-password" required /></label>
        <button className="primary">Sign in</button>
      </form>
    </>
  );
}
