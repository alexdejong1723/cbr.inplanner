import Link from "next/link";
import {
  approveTenantAction, reactivateTenantAction, rejectTenantAction, suspendTenantAction,
} from "@/app/admin-actions";
import { requireAdmin } from "@/lib/admin-auth";
import { fmtDateTime } from "@/lib/format";
import { countTenantsByStatus, listTenantsForAdmin, type TenantStatus } from "@/lib/repo";

export const dynamic = "force-dynamic";

const TABS: { status: TenantStatus; label: string }[] = [
  { status: "pending", label: "In afwachting" },
  { status: "approved", label: "Goedgekeurd" },
  { status: "suspended", label: "Geschorst" },
  { status: "rejected", label: "Afgewezen" },
];

export default function Admin({ searchParams }: { searchParams: { status?: string; ok?: string; fout?: string } }) {
  requireAdmin();
  const status = (TABS.find((t) => t.status === searchParams.status)?.status ?? "pending") as TenantStatus;
  const counts = countTenantsByStatus();
  const tenants = listTenantsForAdmin(status);
  return (
    <>
      <h1>Rijscholen</h1>
      {searchParams.ok && <div className="banner">{searchParams.ok}</div>}
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      <nav className="inline" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Link key={t.status} href={`/admin?status=${t.status}`} className="tag" style={t.status === status ? { borderColor: "var(--brand)", fontWeight: 700 } : undefined}>
            {t.label} ({counts[t.status]})
          </Link>
        ))}
      </nav>
      <div className="card table-wrap">
        {tenants.length === 0 ? <p>Geen rijscholen met deze status.</p> : (
          <table>
            <thead><tr><th>Rijschool</th><th>Eigenaar</th><th>E-mail bevestigd</th><th>Aangemeld</th><th>Actie</th></tr></thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.ownerName}<br /><span className="muted">{t.ownerEmail}</span></td>
                  <td><span className={`tag ${t.ownerVerified ? "ok" : "bad"}`}>{t.ownerVerified ? "Ja" : "Nee"}</span></td>
                  <td>{fmtDateTime(t.createdAt)}</td>
                  <td>
                    {(t.status === "pending" || t.status === "rejected") && (
                      <form action={approveTenantAction} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" disabled={!t.ownerVerified}>Goedkeuren</button>
                      </form>
                    )}
                    {t.status === "pending" && (
                      <form action={rejectTenantAction} className="inline" style={{ marginTop: 6 }}>
                        <input type="hidden" name="id" value={t.id} />
                        <input name="reden" placeholder="Reden (optioneel)" maxLength={500} />
                        <button type="submit" className="danger">Afwijzen</button>
                      </form>
                    )}
                    {t.status === "approved" && (
                      <form action={suspendTenantAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="danger">Schorsen</button>
                      </form>
                    )}
                    {t.status === "suspended" && (
                      <form action={reactivateTenantAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit">Heractiveren</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted">Goedkeuren kan pas als de eigenaar het e-mailadres heeft bevestigd.</p>
    </>
  );
}
