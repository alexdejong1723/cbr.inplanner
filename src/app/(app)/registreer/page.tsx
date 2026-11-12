import Link from "next/link";
import { registerAction } from "@/app/auth-actions";

export default function Registreer({ searchParams }: { searchParams: { fout?: string } }) {
  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Rijschool aanmelden</h1>
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <form action={registerAction} style={{ display: "grid", gap: 12 }}>
        <label>Naam rijschool<input name="rijschool" required /></label>
        <label>Uw naam<input name="naam" required autoComplete="name" /></label>
        <label>E-mailadres<input type="email" name="email" required autoComplete="username" /></label>
        <label>Wachtwoord (min. 12 tekens)<input type="password" name="wachtwoord" required minLength={12} autoComplete="new-password" /></label>
        <button type="submit">Aanmelding versturen</button>
      </form>
      <p className="muted">Na het bevestigen van uw e-mailadres beoordelen wij uw aanmelding. Pas na goedkeuring kunt u inloggen.</p>
      <p className="muted">Heeft u al een account? <Link href="/inloggen">Inloggen</Link></p>
    </div>
  );
}
