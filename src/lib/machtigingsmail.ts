/**
 * Uitlegmail aan een leerling over het machtigen van de rijschool.
 *
 * De stappen komen van de pagina "Opleider machtigen met DigiD" op cbr.nl (stand november 2026).
 * Controleer ze opnieuw als het CBR zijn schermen wijzigt.
 *
 * Bewust puur (geen server of database): de tekst wordt in de browser opgesteld, zodat er geen
 * persoonsgegevens van leerlingen naar onze server hoeven.
 */
export interface MachtigingsmailInput {
  voornaam: string;
  rijschool: string;
  opleiderNaam: string;
  opleidernummer: string;
  theorie: boolean;
  praktijk: boolean;
}

export interface Machtigingsmail { subject: string; body: string }

const clean = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim();

export function buildMachtigingsmail(i: MachtigingsmailInput): Machtigingsmail {
  const voornaam = clean(i.voornaam);
  const rijschool = clean(i.rijschool);
  const opleider = clean(i.opleiderNaam);
  const soorten = [i.theorie && "theorie-examen (auto)", i.praktijk && "praktijkexamen (auto)"].filter(Boolean);
  const soort = soorten.length ? soorten.join(" en ") : "de examensoort waarvoor ik je ga inplannen";
  const meerdere = soorten.length > 1;

  const tips = [
    "Geef je DigiD nooit aan een ander, ook niet aan mij.",
    meerdere ? "Je machtigt elke examensoort apart: doe de stappen dus voor beide." : "Je machtigt per examensoort.",
    "De machtiging is 1 jaar geldig. Ik kan alleen examens inplannen die vóór de einddatum vallen.",
    "Zodra ik een examen voor je reserveer, krijg je een e-mail van het CBR. Spreek de datum dus eerst met mij af: een gereserveerd examen kun je maar beperkt verplaatsen.",
  ];
  if (i.praktijk)
    tips.push("Lukt het niet via Mijn CBR? Laat het me weten. Voor het praktijkexamen is er ook een papieren machtiging met een kopie van je identiteitsbewijs; het CBR verwerkt die binnen een week.");

  const body = [
    `Hallo${voornaam ? ` ${voornaam}` : ""},`,
    "",
    "Voordat ik je voor het examen kan inplannen, moet je mij eerst machtigen bij het CBR. Dat doe je zelf, met je eigen DigiD:",
    "",
    "1. Ga naar https://mijn.cbr.nl en log in met DigiD.",
    `2. Klik op "Opleider machtigen" en kies: ${soort}.`,
    "3. Vul je e-mailadres in en kies wat ik voor je mag reserveren.",
    `4. Zoek mijn rijschool op met CBR-opleidernummer ${clean(i.opleidernummer)} (${rijschool}).`,
    '5. Accepteer de voorwaarden, klik op "Ga verder", controleer je gegevens en klik op "Machtigen".',
    "",
    "Goed om te weten:",
    ...tips.map((t) => `- ${t}`),
    "",
    "Laat het me weten als je klaar bent, dan plan ik het examen in.",
    "",
    "Groet,",
    ...(opleider && opleider !== rijschool ? [opleider, rijschool] : [rijschool]),
  ].join("\n");

  return { subject: `Machtig ${rijschool} via Mijn CBR`, body };
}

/** Eén eenvoudig e-mailadres; alles met speciale tekens laten we weg zodat er niets in de mailto-link kan worden gesmokkeld. */
export const isSimpleEmail = (s: string) => /^[^\s@?&,;<>"%]+@[^\s@?&,;<>"%]+\.[^\s@?&,;<>"%]+$/.test(s);

export function mailtoLink(email: string, mail: Machtigingsmail): string {
  const to = isSimpleEmail(email.trim()) ? email.trim() : "";
  return `mailto:${to}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body.replace(/\n/g, "\r\n"))}`;
}
