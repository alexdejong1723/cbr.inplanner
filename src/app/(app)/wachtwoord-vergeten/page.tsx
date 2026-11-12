import Link from "next/link";
import { forgotPasswordAction } from "@/app/auth-actions";

export default function WachtwoordVergeten({ searchParams }: { searchParams: { ok?: string } }) {
  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Wachtwoord vergeten</h1>
      {searchParams.ok && <div className="banner">{searchParams.ok}</div>}
      <form action={forgotPasswordAction} style={{ display: "grid", gap: 12 }}>
        <label>E-mailadres<input type="email" name="email" required autoComplete="username" /></label>
        <button type="submit">Stuur resetlink</button>
      </form>
      <p className="muted"><Link href="/inloggen">Terug naar inloggen</Link></p>
    </div>
  );
}
