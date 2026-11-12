import { adminLoginAction } from "@/app/admin-actions";

export default function AdminInloggen({ searchParams }: { searchParams: { fout?: string } }) {
  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Beheer: inloggen</h1>
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <form action={adminLoginAction} style={{ display: "grid", gap: 12 }}>
        <label>E-mailadres<input type="email" name="email" required autoComplete="username" /></label>
        <label>Wachtwoord<input type="password" name="wachtwoord" required autoComplete="current-password" /></label>
        <button type="submit">Inloggen</button>
      </form>
    </div>
  );
}
