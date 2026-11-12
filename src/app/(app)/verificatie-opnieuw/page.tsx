import { resendVerificationAction } from "@/app/auth-actions";

export default function VerificatieOpnieuw({ searchParams }: { searchParams: { ok?: string } }) {
  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Verificatiemail opnieuw sturen</h1>
      {searchParams.ok && <div className="banner">{searchParams.ok}</div>}
      <form action={resendVerificationAction} style={{ display: "grid", gap: 12 }}>
        <label>E-mailadres<input type="email" name="email" required autoComplete="username" /></label>
        <button type="submit">Verstuur</button>
      </form>
    </div>
  );
}
