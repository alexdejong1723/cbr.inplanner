import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMachtigingsmail, isSimpleEmail, mailtoLink } from "./machtigingsmail.ts";
import { normalizeOpleidernummer, opleidernummerProblem } from "./opleidernummer.ts";

const base = { voornaam: "Sanne", rijschool: "Rijschool De Weg", opleiderNaam: "Jan de Vries", opleidernummer: "12345", theorie: false, praktijk: true };

test("mail bevat opleidernummer, rijschoolnaam, de Mijn CBR-stappen en geen 'undefined'", () => {
  const { subject, body } = buildMachtigingsmail(base);
  assert.equal(subject, "Machtig Rijschool De Weg via Mijn CBR");
  for (const s of ["12345", "Rijschool De Weg", "https://mijn.cbr.nl", "DigiD", '"Opleider machtigen"', "Hallo Sanne,", "Jan de Vries"])
    assert.ok(body.includes(s), `mist: ${s}`);
  assert.ok(!/undefined|null|NaN/.test(body));
});

test("waarschuwt dat de DigiD niet gedeeld mag worden en noemt 1 jaar geldigheid en de einddatumregel", () => {
  const { body } = buildMachtigingsmail(base);
  assert.ok(body.includes("Geef je DigiD nooit aan een ander"));
  assert.ok(body.includes("1 jaar geldig") && body.includes("vóór de einddatum"));
});

test("papieren alternatief wordt alleen bij praktijk genoemd", () => {
  assert.ok(buildMachtigingsmail({ ...base, praktijk: true, theorie: false }).body.includes("papieren machtiging"));
  assert.ok(!buildMachtigingsmail({ ...base, praktijk: false, theorie: true }).body.includes("papieren machtiging"));
});

test("beide examensoorten: apart machtigen wordt benadrukt", () => {
  const { body } = buildMachtigingsmail({ ...base, theorie: true, praktijk: true });
  assert.ok(body.includes("theorie-examen (auto) en praktijkexamen (auto)"));
  assert.ok(body.includes("beide"));
});

test("zonder voornaam of examensoort blijft de tekst netjes", () => {
  const { body } = buildMachtigingsmail({ ...base, voornaam: "  ", theorie: false, praktijk: false });
  assert.ok(body.startsWith("Hallo,"));
  assert.ok(body.includes("de examensoort waarvoor ik je ga inplannen"));
});

test("regeleinden in invoer kunnen de mail niet manipuleren", () => {
  const { body, subject } = buildMachtigingsmail({ ...base, voornaam: "Sanne\r\nBcc: x@evil.nl", rijschool: "Naam\nMet regel" });
  assert.ok(!body.includes("Sanne\r\nBcc"));
  assert.ok(!subject.includes("\n"));
});

test("mailto-link: geldig adres wordt gebruikt, ongeldig of verdacht adres weggelaten", () => {
  const mail = buildMachtigingsmail(base);
  assert.ok(mailtoLink("sanne@example.nl", mail).startsWith("mailto:sanne@example.nl?subject="));
  assert.ok(mailtoLink("", mail).startsWith("mailto:?subject="));
  assert.ok(mailtoLink("a@b.nl?bcc=x@evil.nl", mail).startsWith("mailto:?subject="));
  assert.equal(isSimpleEmail("a@b.nl,c@d.nl"), false);
  assert.ok(mailtoLink("a@b.nl", mail).includes("%0D%0A"), "regeleinden als CRLF");
});

test("mailto-link blijft onder de ~2000 tekens die sommige mailprogramma's aankunnen", () => {
  const long = { ...base, rijschool: "Rijschool De Lange Naam Verkeersopleidingen", opleiderNaam: "Jan de Vries-van den Berg", voornaam: "Maximiliaan", theorie: true, praktijk: true };
  const len = mailtoLink("maximiliaan@example.nl", buildMachtigingsmail(long)).length;
  assert.ok(len < 2000, `te lang: ${len}`);
});

test("opleidernummer: normaliseren en controleren", () => {
  assert.equal(normalizeOpleidernummer("  12   345 "), "12 345");
  assert.equal(opleidernummerProblem("12345"), undefined);
  assert.equal(opleidernummerProblem("AB-1234"), undefined);
  for (const bad of ["", "12", "!!!", "a".repeat(21), "<script>", "12345;DROP"]) assert.ok(opleidernummerProblem(bad), bad);
});
