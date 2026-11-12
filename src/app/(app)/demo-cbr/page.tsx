import { notFound } from "next/navigation";
import { demoAddAuthorizationAction, demoRemoveAuthorizationAction } from "@/app/demo-actions";
import { requireUser } from "@/lib/auth";
import { isMock } from "@/lib/cbr";
import { mockCbrAuthorizations } from "@/lib/cbr/mock";
import { AUTH_CATEGORY_LABEL } from "@/lib/cbr/types";
import { isoDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Alleen in demomodus: speelt "Mijn CBR" na, waar leerlingen hun rijschool machtigen. */
export default function DemoCbr({ searchParams }: { searchParams: { ok?: string; fout?: string } }) {
  if (!isMock()) notFound();
  const user = requireUser();
  const list = mockCbrAuthorizations(user.tenantId);
  const year = isoDate(new Date(Date.now() + 365 * 86_400_000));
  return (
    <>
      <h1>Demo: Mijn CBR</h1>
      <p className="muted">
        Hier speelt u wat een leerling in Mijn CBR doet. Alleen zichtbaar in demomodus. Wat hier staat, kent het (nagebootste) CBR
        als machtiging aan uw rijschool.
      </p>
      {searchParams.ok && <div className="banner">{searchParams.ok}</div>}
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <form action={demoAddAuthorizationAction} className="card filters">
        <label>Naam<input name="naam" required /></label>
        <label>Geboortedatum<input type="date" name="geboortedatum" required /></label>
        <label>Kandidaatnummer<input name="kandidaatnummer" /></label>
        <label>Examensoort
          <select name="categorie" defaultValue="B_PRAKTIJK">{Object.entries(AUTH_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label>Einddatum<input type="date" name="einddatum" defaultValue={year} required /></label>
        <button type="submit">Leerling machtigt rijschool</button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Leerling</th><th>Examensoort</th><th>T/m</th><th></th></tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={`${a.category}|${a.name}|${a.birthDate}`}>
                <td>{a.name}<div className="muted">{a.birthDate}{a.cbrRef ? ` · ${a.cbrRef}` : ""}</div></td>
                <td>{AUTH_CATEGORY_LABEL[a.category]}</td>
                <td>{a.validUntil}</td>
                <td>
                  <form action={demoRemoveAuthorizationAction}>
                    <input type="hidden" name="categorie" value={a.category} />
                    <input type="hidden" name="naam" value={a.name} />
                    <input type="hidden" name="geboortedatum" value={a.birthDate} />
                    <button type="submit" className="danger">Leerling trekt machtiging in</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
