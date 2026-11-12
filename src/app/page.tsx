import Link from "next/link";
import { getCbrClient } from "@/lib/cbr";
import { fmtDateTime } from "@/lib/format";
import { PRODUCT_LABEL } from "@/lib/cbr/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const reservations = (await getCbrClient().listReservations()).filter(
    (r) => r.status === "gereserveerd",
  );
  const next = reservations[0];
  return (
    <>
      <h1>Overzicht</h1>
      <div className="grid">
        <div className="card">
          <div className="muted">Actieve reserveringen</div>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{reservations.length}</div>
        </div>
        <div className="card">
          <div className="muted">Eerstvolgende examen</div>
          {next ? (
            <div>{PRODUCT_LABEL[next.product]}<br />{fmtDateTime(next.startsAt)}</div>
          ) : (
            <div>Nog niets ingepland</div>
          )}
        </div>
      </div>
      <div className="card">
        <Link href="/plannen">Examen inplannen →</Link>
      </div>
      <div className="card muted">
        Let op: vanaf 1 april 2027 kunnen B-reserveringen niet meer worden geruild of verplaatst.
        Kosteloos annuleren kan tot 28 dagen voor het examen of binnen 48 uur na aankoop.
      </div>
    </>
  );
}
