import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_PATH = ":memory:";
const repo = await import("./repo.ts");

const mk = (n: string) => repo.createTenantWithOwner({ tenantName: `S${n}`, name: n, email: `${n}@example.nl`, passwordHash: "x:y" });
const a = mk("a");
const b = mk("b");
const sanne = { cbrRef: "K1", name: "Sanne Bakker", birthDate: "2006-03-14" };
const item = (category: "B_THEORIE" | "B_PRAKTIJK", validUntil = "2027-12-31", who = sanne) => ({ ...who, category, validUntil });

test("sync maakt leerling en machtigingen aan en is idempotent", () => {
  repo.applyCbrAuthorizations(a.tenantId, [item("B_PRAKTIJK"), item("B_THEORIE")]);
  repo.applyCbrAuthorizations(a.tenantId, [item("B_PRAKTIJK"), item("B_THEORIE")]);
  assert.equal(repo.listCandidates(a.tenantId).length, 1);
  const list = repo.listAuthorizations(a.tenantId);
  assert.equal(list.length, 2);
  assert.ok(list.every((x) => x.source === "cbr" && x.status === "actief" && x.verifiedAt));
  assert.ok(repo.getAuthorizationsSyncedAt(a.tenantId));
});

test("machtiging die uit de CBR-lijst verdwijnt wordt 'niet_meer_zichtbaar' en komt terug als het CBR hem weer toont", () => {
  repo.applyCbrAuthorizations(a.tenantId, [item("B_THEORIE")]); // praktijk weg (bv. examen aangevraagd)
  const c = repo.listCandidates(a.tenantId)[0];
  assert.equal(repo.getAuthorization(a.tenantId, c.id, "B_PRAKTIJK")?.status, "niet_meer_zichtbaar");
  assert.equal(repo.getAuthorization(a.tenantId, c.id, "B_THEORIE")?.status, "actief");
  repo.applyCbrAuthorizations(a.tenantId, [item("B_PRAKTIJK", "2028-01-31"), item("B_THEORIE")]);
  const back = repo.getAuthorization(a.tenantId, c.id, "B_PRAKTIJK")!;
  assert.equal(back.status, "actief");
  assert.equal(back.validUntil, "2028-01-31"); // einddatum van het CBR wordt overgenomen
});

test("handmatige machtigingen blijven bij een sync ongemoeid", () => {
  const m = repo.upsertManualAuthorization(a.tenantId, { name: "Piet Handmatig", birthDate: "2005-05-05", category: "B_PRAKTIJK", validUntil: "2027-10-10" });
  assert.ok(m.ok);
  repo.applyCbrAuthorizations(a.tenantId, [item("B_PRAKTIJK"), item("B_THEORIE")]);
  const piet = repo.getAuthorization(a.tenantId, (m as { candidateId: string }).candidateId, "B_PRAKTIJK")!;
  assert.equal(piet.source, "handmatig");
  assert.equal(piet.status, "actief");
});

test("het CBR kan een handmatige machtiging bevestigen (wordt dan source=cbr), en handmatig overschrijft nooit een CBR-machtiging", () => {
  repo.applyCbrAuthorizations(a.tenantId, [item("B_PRAKTIJK"), item("B_THEORIE"), item("B_PRAKTIJK", "2027-10-10", { cbrRef: "K9", name: "piet  handmatig", birthDate: "2005-05-05" })]);
  const piet = repo.listCandidates(a.tenantId).find((c) => c.name === "Piet Handmatig")!;
  assert.equal(repo.listCandidates(a.tenantId).length, 2, "naam wordt genormaliseerd: geen dubbele leerling");
  assert.equal(repo.getAuthorization(a.tenantId, piet.id, "B_PRAKTIJK")?.source, "cbr");
  assert.equal(piet.cbrRef, "K9", "CBR-nummer wordt aangevuld");
  const r = repo.upsertManualAuthorization(a.tenantId, { name: "Piet Handmatig", birthDate: "2005-05-05", category: "B_PRAKTIJK", validUntil: "2030-01-01" });
  assert.deepEqual(r, { ok: false, reason: "bevestigd-door-cbr" });
  assert.equal(repo.getAuthorization(a.tenantId, piet.id, "B_PRAKTIJK")?.validUntil, "2027-10-10");
});

test("geweigerde of ingetrokken handmatige machtiging kan opnieuw worden ingevoerd", () => {
  const m = repo.upsertManualAuthorization(b.tenantId, { name: "Eva", birthDate: "2006-02-02", category: "B_THEORIE", validUntil: "2027-09-09" }) as { ok: true; authorizationId: string; candidateId: string };
  repo.setAuthorizationStatus(b.tenantId, m.authorizationId, "geweigerd");
  assert.equal(repo.getAuthorizationById(b.tenantId, m.authorizationId)?.status, "geweigerd");
  const again = repo.upsertManualAuthorization(b.tenantId, { name: "Eva", birthDate: "2006-02-02", category: "B_THEORIE", validUntil: "2027-11-11" });
  assert.ok(again.ok);
  assert.equal(repo.getAuthorizationById(b.tenantId, m.authorizationId)?.status, "actief");
});

test("rijscholen zien elkaars machtigingen en leerlingen niet; sync van A raakt B niet", () => {
  assert.equal(repo.listCandidates(b.tenantId).some((c) => c.name === "Sanne Bakker"), false);
  repo.applyCbrAuthorizations(b.tenantId, []); // B krijgt een lege lijst
  assert.ok(repo.listAuthorizations(a.tenantId).some((x) => x.status === "actief"));
  const evaAuth = repo.listAuthorizations(b.tenantId).find((x) => x.source === "handmatig");
  assert.ok(evaAuth, "handmatige machtiging van B blijft bestaan na lege CBR-lijst");
  // niet over tenants heen kunnen wijzigen
  repo.setAuthorizationStatus(a.tenantId, evaAuth!.id, "ingetrokken");
  assert.equal(repo.getAuthorizationById(b.tenantId, evaAuth!.id)?.status, evaAuth!.status);
});

test("leerlingen met hetzelfde CBR-nummer in een andere rijschool zijn aparte leerlingen", () => {
  repo.applyCbrAuthorizations(b.tenantId, [item("B_PRAKTIJK")]);
  const sa = repo.listCandidates(a.tenantId).find((c) => c.cbrRef === "K1")!;
  const sb = repo.listCandidates(b.tenantId).find((c) => c.cbrRef === "K1")!;
  assert.notEqual(sa.id, sb.id);
});
