import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getTenant } from "@/lib/repo";
import MailForm from "./MailForm";

export const dynamic = "force-dynamic";

export default function Machtigingsmail() {
  const user = requireUser();
  const tenant = getTenant(user.tenantId)!;
  return (
    <>
      <h1>Machtigingsmail voor een leerling</h1>
      <p className="muted">
        Een leerling moet u eerst zelf machtigen in Mijn CBR voordat u een examen kunt inplannen. Stel hier de uitleg op en stuur
        die vanuit uw eigen mailprogramma. Zo komt de mail van u, en worden er geen gegevens van de leerling in deze app opgeslagen.
      </p>
      {tenant.opleidernummer ? (
        <MailForm rijschool={tenant.name} opleiderNaam={user.name} opleidernummer={tenant.opleidernummer} />
      ) : (
        <div className="banner">
          Vul eerst uw CBR-opleidernummer in bij <Link href="/instellingen">Instellingen</Link>; leerlingen hebben dat nodig om u te vinden.
        </div>
      )}
    </>
  );
}
