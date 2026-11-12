import Link from "next/link";
import { confirmEmailAction } from "@/app/auth-actions";
import { peekToken } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function Verifieer({ searchParams }: { searchParams: { token?: string; fout?: string } }) {
  const token = searchParams.token ?? "";
  const valid = token !== "" && peekToken(token, "verify");
  return (
    <div className="card" style={{ maxWidth: 460, margin: "40px auto" }}>
      <h1>E-mailadres bevestigen</h1>
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      {valid ? (
        <form action={confirmEmailAction}>
          <input type="hidden" name="token" value={token} />
          <p>Klik op de knop om uw e-mailadres te bevestigen.</p>
          <button type="submit">Bevestig e-mailadres</button>
        </form>
      ) : (
        <p>Deze link is ongeldig of verlopen. <Link href="/verificatie-opnieuw">Vraag een nieuwe link aan</Link>.</p>
      )}
    </div>
  );
}
