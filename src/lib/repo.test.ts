import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_PATH = ":memory:";
const repo = await import("./repo.ts");

const mk = (n: string) =>
  repo.createTenantWithOwner({ tenantName: `School ${n}`, name: `Eigenaar ${n}`, email: `${n}@example.nl`, passwordHash: "x:y" });

const a = mk("a");
const b = mk("b");

test("elke rijschool krijgt een eigen tenant", () => {
  assert.notEqual(a.tenantId, b.tenantId);
});

test("leerlingen zijn per rijschool gescheiden", () => {
  const c = repo.addCandidate(a.tenantId, "Leerling van A", true);
  assert.equal(repo.listCandidates(a.tenantId).length, 1);
  assert.equal(repo.listCandidates(b.tenantId).length, 0);
  assert.equal(repo.getCandidate(b.tenantId, c.id), undefined);
});

test("andere rijschool kan reservering niet zien of annuleren (IDOR)", () => {
  const c = repo.addCandidate(a.tenantId, "Sanne", true);
  repo.insertReservation(a.tenantId, a.id, {
    id: "cbr-1", candidateId: c.id, product: "B_PRAKTIJK", locationId: "ams",
    startsAt: "2027-09-01T08:00:00Z", purchasedAt: "2027-05-01T08:00:00Z", status: "gereserveerd",
  });
  const id = repo.listReservations(a.tenantId)[0].id;
  assert.equal(repo.getReservation(b.tenantId, id), undefined);
  repo.markCancelled(b.tenantId, id); // moet niets doen
  assert.equal(repo.getReservation(a.tenantId, id)?.status, "gereserveerd");
  assert.equal(repo.listReservations(b.tenantId).length, 0);
});

test("auditlog en gebruikers zijn per rijschool gescheiden", () => {
  assert.ok(repo.listAudit(a.tenantId).length > 0);
  assert.equal(repo.listUsers(b.tenantId).length, 1);
  assert.ok(repo.listAudit(b.tenantId).every((r) => r.userName !== "Eigenaar a"));
});
