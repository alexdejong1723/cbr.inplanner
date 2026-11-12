import Link from "next/link";
import { resetPasswordAction } from "@/app/auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { peekToken } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function WachtwoordResetten({ searchParams }: { searchParams: { token?: string; fout?: string } }) {
  const token = searchParams.token ?? "";
  const valid = token !== "" && peekToken(token, "reset");
  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Nieuw wachtwoord instellen</h1>
      {searchParams.fout && <div className="banner">{searchParams.fout}</div>}
      {valid ? (
        <form action={resetPasswordAction} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="token" value={token} />
          <label>Nieuw wachtwoord (min. {MIN_PASSWORD_LENGTH} tekens)
            <input type="password" name="wachtwoord" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
          </label>
          <label>Herhaal wachtwoord
            <input type="password" name="herhaal" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
          </label>
          <button type="submit">Wachtwoord opslaan</button>
        </form>
      ) : (
        <p>Deze link is ongeldig, verlopen of al gebruikt. <Link href="/wachtwoord-vergeten">Vraag een nieuwe aan</Link>.</p>
      )}
    </div>
  );
}
