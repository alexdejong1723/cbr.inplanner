import { requireUser } from "@/lib/auth";
import { getCbrClient } from "@/lib/cbr";
import { listCandidates, listReservations } from "@/lib/repo";
import { CANCEL_REASON_TEXT, canCancel, freeCancelDeadline } from "@/lib/cbr/rules";
import { PRODUCT_LABEL } from "@/lib/cbr/types";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cancelAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Reserveringen({ searchParams }: { searchParams: { ok?: string; fout?: string } }) {
  const user = requireUser();
  const reservations = listReservations(user.tenantId);
  const locations = await getCbrClient(user.tenantId).listLocations();
  const candidates = listCandidates(user.tenantId);
  const loc = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const cand = Object.fromEntries(candidates.map((c) => [c.id, c.name]));
  const now = new Date();

  return (
    <>
      <h1>Reserveringen</h1>
      {searchParams.ok && <div className="banner">Gelukt: {searchParams.ok}.</div>}
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <div className="card table-wrap">
        {reservations.length === 0 ? <p>Nog geen reserveringen.</p> : (
          <table>
            <thead><tr><th>Leerling</th><th>Product</th><th>Moment</th><th>Locatie</th><th>Status</th><th>Annuleren</th></tr></thead>
            <tbody>
              {reservations.map((r) => {
                const d = canCancel(r, now);
                return (
                  <tr key={r.id}>
                    <td>{cand[r.candidateId] ?? r.candidateId}</td>
                    <td>{PRODUCT_LABEL[r.product]}</td>
                    <td>{fmtDateTime(r.startsAt)}</td>
                    <td>{loc[r.locationId]}</td>
                    <td><span className={`tag ${r.status === "gereserveerd" ? "ok" : "bad"}`}>{r.status}</span></td>
                    <td>
                      {r.status === "gereserveerd" && (
                        <form action={cancelAction} className="inline">
                          <input type="hidden" name="id" value={r.id} />
                          <button className="danger" disabled={!d.allowed}>Annuleer</button>
                          <span className="muted">
                            {d.allowed ? `Gratis t/m ${fmtDate(freeCancelDeadline(r))}` : CANCEL_REASON_TEXT[d.reason]}
                          </span>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
