import { requireUser } from "@/lib/auth";
import { getCbrClient } from "@/lib/cbr";
import { listCandidates } from "@/lib/repo";
import { PRODUCT_LABEL, type Product } from "@/lib/cbr/types";
import { fmtDateTime, isoDate } from "@/lib/format";
import { reserveAction } from "../actions";

export const dynamic = "force-dynamic";

type Params = { product?: Product; locatie?: string; vanaf?: string; fout?: string };

export default async function Plannen({ searchParams }: { searchParams: Params }) {
  const user = requireUser();
  const client = getCbrClient(user.tenantId);
  const today = new Date();
  const product = (searchParams.product ?? "B_PRAKTIJK") as Product;
  const locatie = searchParams.locatie || undefined;
  const vanaf = searchParams.vanaf || isoDate(new Date(today.getTime() + 7 * 86_400_000));
  const to = new Date(new Date(vanaf).getTime() + 14 * 86_400_000).toISOString();

  const [locations, candidates, slots] = await Promise.all([
    client.listLocations(),
    Promise.resolve(listCandidates(user.tenantId)),
    client.findAvailability({ product, locationId: locatie, from: new Date(vanaf).toISOString(), to }),
  ]);
  const locName = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const back = `/plannen?product=${product}&locatie=${locatie ?? ""}&vanaf=${vanaf}`;

  return (
    <>
      <h1>Examen inplannen</h1>
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <form className="card filters" method="get">
        <label>Product
          <select name="product" defaultValue={product}>
            {Object.entries(PRODUCT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Locatie
          <select name="locatie" defaultValue={locatie ?? ""}>
            <option value="">Alle locaties</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label>Vanaf
          <input type="date" name="vanaf" defaultValue={vanaf} />
        </label>
        <button type="submit">Zoeken</button>
      </form>

      <div className="card table-wrap">
        {slots.length === 0 ? <p>Geen beschikbare plekken gevonden. Er komen op wisselende momenten plekken vrij.</p> : (
          <table>
            <thead><tr><th>Moment</th><th>Locatie</th><th>Reserveren voor</th></tr></thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id}>
                  <td>{fmtDateTime(s.startsAt)}</td>
                  <td>{locName[s.locationId]}</td>
                  <td>
                    <form action={reserveAction} className="inline">
                      <input type="hidden" name="slotId" value={s.id} />
                      <input type="hidden" name="back" value={back} />
                      <select name="candidateId" defaultValue="" aria-label="Leerling">
                        <option value="" disabled>Kies leerling…</option>
                        {candidates.filter((c) => c.authorized).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button type="submit">Reserveer</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
