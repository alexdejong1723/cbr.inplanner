import { listCandidates } from "@/lib/cbr";

export default async function Leerlingen() {
  const candidates = await listCandidates();
  return (
    <>
      <h1>Leerlingen</h1>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Naam</th><th>Machtiging CBR</th></tr></thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td><span className={`tag ${c.authorized ? "ok" : "bad"}`}>{c.authorized ? "Gemachtigd" : "Geen machtiging"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Zonder machtiging van de kandidaat mogen er volgens de gebruikersvoorwaarden geen gegevens worden verwerkt.</p>
    </>
  );
}
