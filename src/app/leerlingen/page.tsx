import { requireUser } from "@/lib/auth";
import { listCandidates } from "@/lib/repo";
import { addCandidateAction, setAuthorizedAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Leerlingen({ searchParams }: { searchParams: { fout?: string } }) {
  const user = requireUser();
  const candidates = listCandidates(user.tenantId);
  return (
    <>
      <h1>Leerlingen</h1>
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <form action={addCandidateAction} className="card filters">
        <label>Naam<input name="naam" required /></label>
        <label className="inline" style={{ flexDirection: "row" }}>
          <input type="checkbox" name="gemachtigd" /> Heeft de rijschool gemachtigd
        </label>
        <button type="submit">Leerling toevoegen</button>
      </form>
      <div className="card table-wrap">
        {candidates.length === 0 ? <p>Nog geen leerlingen.</p> : (
          <table>
            <thead><tr><th>Naam</th><th>Machtiging CBR</th><th></th></tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td><span className={`tag ${c.authorized ? "ok" : "bad"}`}>{c.authorized ? "Gemachtigd" : "Geen machtiging"}</span></td>
                  <td>
                    <form action={setAuthorizedAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="gemachtigd" value={c.authorized ? "0" : "1"} />
                      <button type="submit" className="danger">{c.authorized ? "Machtiging intrekken" : "Machtiging bevestigen"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted">Zonder machtiging van de kandidaat mogen er volgens de gebruikersvoorwaarden van het CBR geen gegevens worden verwerkt.</p>
    </>
  );
}
