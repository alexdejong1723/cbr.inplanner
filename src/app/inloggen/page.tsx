import Link from "next/link";
import { loginAction } from "../auth-actions";

export default function Inloggen({ searchParams }: { searchParams: { fout?: string } }) {
  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Inloggen</h1>
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <form action={loginAction} style={{ display: "grid", gap: 12 }}>
        <label>E-mailadres<input type="email" name="email" required autoComplete="username" /></label>
        <label>Wachtwoord<input type="password" name="wachtwoord" required autoComplete="current-password" /></label>
        <button type="submit">Inloggen</button>
      </form>
      <p className="muted">Nog geen account? <Link href="/registreer">Rijschool aanmelden</Link></p>
    </div>
  );
}
