import Link from "next/link";
import { adminLogoutAction } from "@/app/admin-actions";
import { getAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beheer · CBR Inplanner", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = getAdmin();
  return (
    <>
      <header className="nav">
        <div className="in">
          <strong>CBR Inplanner · Beheer</strong>
          {admin ? (
            <>
              <Link href="/admin">Rijscholen</Link>
              <form action={adminLogoutAction} className="inline">
                <span className="muted">{admin.name}</span>
                <button type="submit" className="danger">Uitloggen</button>
              </form>
            </>
          ) : null}
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
