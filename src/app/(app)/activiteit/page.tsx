import { requireUser } from "@/lib/auth";
import { listAudit } from "@/lib/repo";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function Activiteit() {
  const user = requireUser();
  const rows = listAudit(user.tenantId);
  return (
    <>
      <h1>Activiteit</h1>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Wanneer</th><th>Wie</th><th>Actie</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td>{fmtDateTime(r.at)}</td><td>{r.userName}</td><td>{r.action}</td><td>{r.detail}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
