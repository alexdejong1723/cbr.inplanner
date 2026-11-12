import Link from "next/link";
import {
  addManualAuthorizationAction, refreshAuthorizationsAction, revokeManualAuthorizationAction,
} from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { syncAuthorizations } from "@/lib/authorization-sync";
import { describe } from "@/lib/cbr/authorizations";
import { getCbrClient, isMock } from "@/lib/cbr";
import { AUTH_CATEGORY_LABEL, categoryForProduct } from "@/lib/cbr/types";
import { fmtDateTime, isoDate } from "@/lib/format";
import { listAuthorizations, listCandidates, listReservations } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function Leerlingen({ searchParams }: { searchParams: { fout?: string; ok?: string } }) {
  const user = requireUser();
  const listMode = getCbrClient(user.tenantId).supportsAuthorizationList;
  const sync = await syncAuthorizations(user.tenantId); // lazy: alleen als het overzicht verouderd is
  const today = new Date();
  const candidates = listCandidates(user.tenantId);
  const auths = listAuthorizations(user.tenantId);
  const activeReservations = listReservations(user.tenantId).filter((r) => r.status === "gereserveerd" && new Date(r.startsAt) > today);
  const hasReservation = (candidateId: string, category: string) =>
    activeReservations.some((r) => r.candidateId === candidateId && categoryForProduct(r.product) === category);

  return (
    <>
      <h1>Leerlingen en machtigingen</h1>
      {searchParams.ok && <div className="banner">{searchParams.ok}</div>}
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      {sync.status === "fout" && <div className="banner">Het CBR is nu niet bereikbaar; we tonen het laatst bekende overzicht.</div>}

      <div className="card">
        <strong>Hoe laat ik een leerling mij machtigen?</strong>
        <ol className="muted">
          <li>De leerling logt in op <em>Mijn CBR</em> (mijn.cbr.nl) met <strong>DigiD</strong> en kiest &ldquo;Opleider machtigen&rdquo;.</li>
          <li>De leerling zoekt uw rijschool op met uw CBR-opleidernummer en kiest de examensoort (theorie en praktijk machtigt de leerling apart).</li>
          <li>De machtiging is 1 jaar geldig. U kunt alleen examens reserveren die vóór de einddatum vallen.</li>
        </ol>
        <p className="muted">Een e-mail van de leerling is geen machtiging: de machtiging moet bij het CBR staan.</p>
      </div>

      {listMode ? (
        <form action={refreshAuthorizationsAction} className="card inline">
          <span className="muted">
            Machtigingen komen rechtstreeks van het CBR.{" "}
            {sync.syncedAt ? `Laatst bijgewerkt: ${fmtDateTime(sync.syncedAt)}.` : "Nog niet opgehaald."}
          </span>
          <button type="submit">Vernieuwen</button>
        </form>
      ) : (
        <form action={addManualAuthorizationAction} className="card filters">
          <div style={{ flexBasis: "100%" }}>
            <strong>Machtiging handmatig invoeren</strong>
            <div className="muted">
              Het CBR levert (nog) geen overzicht van machtigingen. Voer een machtiging in nadat de leerling u via Mijn CBR heeft gemachtigd.
              Het CBR controleert bij het reserveren; wijst het de machtiging af, dan markeren wij die als geweigerd.
            </div>
          </div>
          <label>Naam leerling<input name="naam" required /></label>
          <label>Geboortedatum<input type="date" name="geboortedatum" required max={isoDate(today)} /></label>
          <label>CBR-kandidaatnummer (optioneel)<input name="kandidaatnummer" /></label>
          <label>Examensoort
            <select name="categorie" defaultValue="B_PRAKTIJK">
              {Object.entries(AUTH_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Einddatum machtiging
            <input type="date" name="einddatum" required min={isoDate(today)} defaultValue={isoDate(new Date(today.getTime() + 365 * 86_400_000))} />
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", flexBasis: "100%" }}>
            <input type="checkbox" name="bevestiging" /> Ik heb gecontroleerd dat deze leerling mij voor deze examensoort heeft gemachtigd
          </label>
          <button type="submit">Opslaan</button>
        </form>
      )}

      <div className="card table-wrap">
        {candidates.length === 0 ? (
          <p>Nog geen leerlingen.{" "}{listMode ? "Zodra een leerling u machtigt in Mijn CBR, verschijnt die hier na het vernieuwen." : "Voer hierboven een machtiging in."}</p>
        ) : (
          <table>
            <thead><tr><th>Leerling</th><th>Machtigingen</th></tr></thead>
            <tbody>
              {candidates.map((c) => {
                const mine = auths.filter((a) => a.candidateId === c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      <div className="muted">{c.birthDate ?? "geboortedatum onbekend"}{c.cbrRef ? ` · ${c.cbrRef}` : ""}</div>
                    </td>
                    <td>
                      {mine.length === 0 ? <span className="tag bad">Geen machtiging</span> : mine.map((a) => {
                        const d = describe(a, { listMode, today, hasActiveReservation: hasReservation(c.id, a.category) });
                        return (
                          <div key={a.id} className="inline" style={{ marginBottom: 6, flexWrap: "wrap" }}>
                            <strong>{AUTH_CATEGORY_LABEL[a.category]}</strong>
                            <span className={`tag ${d.tone === "ok" ? "ok" : d.tone === "bad" ? "bad" : ""}`}>{d.label}</span>
                            {a.source === "handmatig" && a.status === "actief" && !listMode && (
                              <form action={revokeManualAuthorizationAction}>
                                <input type="hidden" name="id" value={a.id} />
                                <button type="submit" className="danger">Intrekken</button>
                              </form>
                            )}
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {isMock() && <p className="muted">Demo: <Link href="/demo-cbr">simuleer een leerling die in Mijn CBR machtigt</Link>.</p>}
    </>
  );
}
