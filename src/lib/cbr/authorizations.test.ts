import { test } from "node:test";
import assert from "node:assert/strict";
import { amsterdamDate, describe, eligibleCandidateIds, usability, type StoredAuthorization } from "./authorizations.ts";

const today = new Date("2027-06-01T10:00:00Z");
const auth = (o: Partial<StoredAuthorization> = {}): StoredAuthorization => ({
  id: "a1", candidateId: "c1", category: "B_PRAKTIJK", validUntil: "2027-12-31",
  source: "cbr", status: "actief", verifiedAt: "2027-06-01T09:00:00Z", ...o,
});

test("actieve CBR-machtiging is bruikbaar", () => {
  assert.deepEqual(usability(auth(), { listMode: true, today, examStartsAt: "2027-09-01T08:00:00Z" }), { ok: true });
});

test("examen na de einddatum is niet toegestaan, op de einddatum zelf wel", () => {
  const a = auth({ validUntil: "2027-09-01" });
  assert.deepEqual(usability(a, { listMode: true, today, examStartsAt: "2027-09-02T08:00:00Z" }), { ok: false, reason: "na-einddatum" });
  assert.equal(usability(a, { listMode: true, today, examStartsAt: "2027-09-01T08:00:00Z" }).ok, true);
});

test("einddatum wordt in Nederlandse tijd beoordeeld", () => {
  // 31 aug 23:30 UTC is 1 sep 01:30 in Nederland (zomertijd)
  assert.equal(amsterdamDate("2027-08-31T23:30:00Z"), "2027-09-01");
  const a = auth({ validUntil: "2027-08-31" });
  assert.equal(usability(a, { listMode: true, today, examStartsAt: "2027-08-31T23:30:00Z" }).ok, false);
});

test("verlopen machtiging is niet bruikbaar", () => {
  assert.deepEqual(usability(auth({ validUntil: "2027-05-31" }), { listMode: true, today }), { ok: false, reason: "verlopen" });
});

test("niet-actieve statussen zijn nooit bruikbaar", () => {
  for (const status of ["niet_meer_zichtbaar", "geweigerd", "ingetrokken"] as const)
    assert.deepEqual(usability(auth({ status }), { listMode: false, today }), { ok: false, reason: "status" });
});

test("als het CBR een overzicht levert tellen handmatige machtigingen niet mee; in de terugvaloptie wel", () => {
  const manual = auth({ source: "handmatig", verifiedAt: null });
  assert.deepEqual(usability(manual, { listMode: true, today }), { ok: false, reason: "niet-geverifieerd" });
  assert.equal(usability(manual, { listMode: false, today }).ok, true);
});

test("keuzelijst: alleen leerlingen met geldige machtiging voor de juiste categorie en datum", () => {
  const auths = [
    auth({ id: "1", candidateId: "praktijk-ok" }),
    auth({ id: "2", candidateId: "alleen-theorie", category: "B_THEORIE" }),
    auth({ id: "3", candidateId: "verlopen-voor-examen", validUntil: "2027-07-01" }),
    auth({ id: "4", candidateId: "ingetrokken", status: "ingetrokken" }),
  ];
  const ids = eligibleCandidateIds(auths, "B_PRAKTIJK", "2027-09-01T08:00:00Z", { listMode: true, today });
  assert.deepEqual([...ids], ["praktijk-ok"]);
  // herexamen en tussentijdse toets vallen onder praktijk, theorie niet
  assert.deepEqual([...eligibleCandidateIds(auths, "B_HEREXAMEN", "2027-09-01T08:00:00Z", { listMode: true, today })], ["praktijk-ok"]);
  assert.deepEqual([...eligibleCandidateIds(auths, "B_THEORIE", "2027-09-01T08:00:00Z", { listMode: true, today })], ["alleen-theorie"]);
});

test("beschrijving: verdwenen uit CBR-lijst met lopend examen is geen alarm, zonder examen wel", () => {
  const gone = auth({ status: "niet_meer_zichtbaar" });
  assert.equal(describe(gone, { listMode: true, today, hasActiveReservation: true }).tone, "muted");
  assert.equal(describe(gone, { listMode: true, today, hasActiveReservation: false }).tone, "bad");
  assert.equal(describe(auth({ validUntil: "2027-06-15" }), { listMode: true, today, hasActiveReservation: false }).tone, "warn");
  assert.equal(describe(auth(), { listMode: true, today, hasActiveReservation: false }).tone, "ok");
});
