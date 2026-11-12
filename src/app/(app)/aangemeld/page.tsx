import Link from "next/link";

export default function Aangemeld() {
  return (
    <div className="card" style={{ maxWidth: 520, margin: "40px auto" }}>
      <h1>Aanmelding ontvangen</h1>
      <ol>
        <li><strong>Bevestig uw e-mailadres</strong> via de link die we u hebben gestuurd.</li>
        <li><strong>Wij beoordelen uw aanmelding.</strong> Uw account heeft tot die tijd de status &ldquo;in afwachting&rdquo;.</li>
        <li>Na goedkeuring ontvangt u een e-mail en kunt u inloggen.</li>
      </ol>
      <p className="muted">Geen e-mail gekregen? Kijk in uw spam of <Link href="/verificatie-opnieuw">vraag een nieuwe aan</Link>.</p>
    </div>
  );
}
