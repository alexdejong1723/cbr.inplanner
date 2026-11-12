import { requireUser } from "@/lib/auth";
import { listUsers } from "@/lib/repo";
import { addTeamMemberAction } from "../auth-actions";

export const dynamic = "force-dynamic";

export default function Team({ searchParams }: { searchParams: { ok?: string; fout?: string } }) {
  const me = requireUser("eigenaar");
  const users = listUsers(me.tenantId);
  return (
    <>
      <h1>Team</h1>
      {searchParams.ok && <div className="banner">Gebruiker {searchParams.ok}.</div>}
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Naam</th><th>E-mail</th><th>Rol</th></tr></thead>
          <tbody>{users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td></tr>)}</tbody>
        </table>
      </div>
      <form action={addTeamMemberAction} className="card filters">
        <label>Naam<input name="naam" required /></label>
        <label>E-mail<input type="email" name="email" required /></label>
        <label>Tijdelijk wachtwoord<input type="password" name="wachtwoord" required minLength={12} autoComplete="new-password" /></label>
        <label>Rol
          <select name="rol"><option value="planner">Planner</option><option value="eigenaar">Eigenaar</option></select>
        </label>
        <button type="submit">Gebruiker toevoegen</button>
      </form>
      <p className="muted">Planners kunnen leerlingen beheren en examens inplannen. Alleen eigenaren beheren het team.</p>
    </>
  );
}
