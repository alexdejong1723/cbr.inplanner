"use client";

import { useRef, useState } from "react";
import { buildMachtigingsmail, mailtoLink } from "@/lib/machtigingsmail";

/**
 * Stelt de uitlegmail op in de browser. Naam en e-mailadres van de leerling verlaten dit scherm niet
 * (niets wordt naar de server gestuurd of opgeslagen); de mail verstuurt u zelf vanuit uw eigen mailprogramma.
 */
export default function MailForm(props: { rijschool: string; opleiderNaam: string; opleidernummer: string }) {
  const [voornaam, setVoornaam] = useState("");
  const [email, setEmail] = useState("");
  const [theorie, setTheorie] = useState(false);
  const [praktijk, setPraktijk] = useState(true);
  const [copied, setCopied] = useState<"ja" | "nee" | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const mail = buildMachtigingsmail({ ...props, voornaam, theorie, praktijk });

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Onderwerp: ${mail.subject}\n\n${mail.body}`);
      setCopied("ja");
    } catch {
      area.current?.select(); // terugval: selecteren, de gebruiker kopieert zelf met Ctrl+C
      setCopied("nee");
    }
  }

  return (
    <>
      <div className="card filters">
        <label>Voornaam leerling (optioneel)
          <input value={voornaam} onChange={(e) => setVoornaam(e.target.value)} name="voornaam" autoComplete="off" />
        </label>
        <label>E-mailadres leerling (optioneel)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} name="email" autoComplete="off" />
        </label>
        <label style={{ flexDirection: "row", alignItems: "center" }}>
          <input type="checkbox" checked={theorie} onChange={(e) => setTheorie(e.target.checked)} /> Theorie
        </label>
        <label style={{ flexDirection: "row", alignItems: "center" }}>
          <input type="checkbox" checked={praktijk} onChange={(e) => setPraktijk(e.target.checked)} /> Praktijk
        </label>
      </div>
      <div className="card">
        <div className="muted">Onderwerp</div>
        <div data-testid="subject"><strong>{mail.subject}</strong></div>
        <textarea
          ref={area}
          readOnly
          value={mail.body}
          rows={22}
          aria-label="Tekst van de mail"
          style={{ width: "100%", marginTop: 12, fontFamily: "inherit", padding: 10, border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)" }}
        />
        <div className="inline" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <a href={mailtoLink(email, mail)} role="button" className="tag" style={{ padding: "8px 12px", background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }}>
            Openen in mijn mailprogramma
          </a>
          <button type="button" onClick={copy}>Kopieer tekst</button>
          {copied === "ja" && <span className="muted">Gekopieerd.</span>}
          {copied === "nee" && <span className="muted">Kopiëren lukte niet; de tekst is geselecteerd, kopieer met Ctrl+C.</span>}
        </div>
      </div>
    </>
  );
}
