import Link from "next/link";
import { getUser } from "@/lib/auth";
import { isMock } from "@/lib/cbr";
import { getTenant } from "@/lib/repo";
import { logoutAction } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = getUser();
  const tenant = user && getTenant(user.tenantId);
  return (
    <>
        <header className="nav">
          <div className="in">
            <strong>CBR Inplanner</strong>
            {user ? (
              <>
                <Link href="/">Overzicht</Link>
                <Link href="/plannen">Examen inplannen</Link>
                <Link href="/reserveringen">Reserveringen</Link>
                <Link href="/leerlingen">Leerlingen</Link>
                <Link href="/activiteit">Activiteit</Link>
                <form action={logoutAction} className="inline">
                  <span className="muted">{tenant?.name} · {user.name}</span>
                  <button type="submit" className="danger">Uitloggen</button>
                </form>
              </>
            ) : (
              <Link href="/inloggen">Inloggen</Link>
            )}
          </div>
        </header>
        <main>
          {isMock() && (
            <div className="banner">
              Demomodus: er wordt niet met het echte CBR gesproken. Gegevens zijn fictief.
            </div>
          )}
          {children}
        </main>
    </>
  );
}
