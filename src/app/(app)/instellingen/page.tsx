import Link from "next/link";
import { saveOpleidernummerAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { getTenant } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function Instellingen({ searchParams }: { searchParams: { ok?: string; fout?: string } }) {
  const user = requireUser();
  const tenant = getTenant(user.tenantId)!;
  return (
    <>
      <h1>Instellingen</h1>
      {searchParams.ok && <div className="banner">{searchParams.ok}</div>}
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <div className="card">
        <div className="muted">Rijschool</div>
        <div>{tenant.name}</div>
        <div className="muted" style={{ marginTop: 8 }}>Rijschoolhouder</div>
        <div>{user.name} ({user.email})</div>
      </div>
      <form action={saveOpleidernummerAction} className="card" style={{ display: "grid", gap: 12, maxWidth: 480 }}>
        <label>CBR-opleidernummer
          <input key={tenant.opleidernummer ?? ""} name="opleidernummer" defaultValue={tenant.opleidernummer ?? ""} maxLength={30} autoComplete="off" />
        </label>
        <p className="muted" style={{ margin: 0 }}>
          Met dit nummer vinden leerlingen uw rijschool in Mijn CBR als ze u machtigen. U vindt het in de
          Rijschoolzoeker van het CBR. Het staat in de uitlegmail aan leerlingen.
        </p>
        <div className="inline">
          <button type="submit">Opslaan</button>
          {tenant.opleidernummer && <Link href="/machtigingsmail">Machtigingsmail opstellen →</Link>}
        </div>
      </form>
    </>
  );
}
