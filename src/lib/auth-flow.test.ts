import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.DATABASE_PATH = ":memory:";
const repo = await import("./repo.ts");
const { db } = await import("./db.ts");
const { hashPassword, verifyPassword, passwordProblem } = await import("./password.ts");
const { allow } = await import("./ratelimit.ts");

const owner = repo.createTenantWithOwner({ tenantName: "Flow School", name: "Eva", email: "eva@example.nl", passwordHash: hashPassword("een-lang-wachtwoord") });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const session = (userId: string) => {
  const t = `tok-${Math.random()}`;
  repo.insertSession(sha(t), userId, new Date(Date.now() + 3_600_000));
  return sha(t);
};

test("nieuwe rijschool start als pending en eigenaar is niet bevestigd", () => {
  assert.equal(repo.getTenant(owner.tenantId)?.status, "pending");
  const u = repo.findUserByEmail("eva@example.nl")!;
  assert.equal(u.emailVerified, false);
  assert.equal(u.tenantStatus, "pending");
});

test("sessie werkt pas na e-mailbevestiging EN goedkeuring", () => {
  const h = session(owner.id);
  assert.equal(repo.userForSession(h), undefined); // pending + niet bevestigd
  repo.verifyUserEmail(owner.id);
  assert.equal(repo.userForSession(h), undefined); // bevestigd, nog pending
  assert.ok(repo.setTenantStatus(owner.tenantId, "approved"));
  assert.equal(repo.userForSession(h)?.id, owner.id); // beide ok
  assert.ok(repo.setTenantStatus(owner.tenantId, "suspended"));
  assert.equal(repo.userForSession(h), undefined); // geschorst: bestaande sessie meteen ongeldig
  assert.ok(repo.setTenantStatus(owner.tenantId, "approved"));
});

test("niet-toegestane statusovergangen worden geweigerd", () => {
  const o2 = repo.createTenantWithOwner({ tenantName: "Twee", name: "Tom", email: "tom@example.nl", passwordHash: "x:y" });
  assert.equal(repo.setTenantStatus(o2.tenantId, "suspended"), false); // pending → suspended mag niet
  assert.ok(repo.setTenantStatus(o2.tenantId, "rejected"));
  assert.equal(repo.getTenant(o2.tenantId)?.status, "rejected");
  assert.equal(repo.setTenantStatus(o2.tenantId, "pending"), false);
});

test("token is eenmalig te gebruiken", () => {
  const raw = repo.createToken(owner.id, "reset", 60_000);
  assert.equal(repo.peekToken(raw, "reset"), true);
  assert.equal(repo.consumeToken(raw, "reset"), owner.id);
  assert.equal(repo.consumeToken(raw, "reset"), undefined);
  assert.equal(repo.peekToken(raw, "reset"), false);
});

test("token met verkeerd doel of verlopen werkt niet", () => {
  const raw = repo.createToken(owner.id, "verify", 60_000);
  assert.equal(repo.consumeToken(raw, "reset"), undefined);
  assert.equal(repo.consumeToken(raw, "verify"), owner.id);
  const expired = repo.createToken(owner.id, "reset", -1000);
  assert.equal(repo.consumeToken(expired, "reset"), undefined);
});

test("nieuw token vervangt het vorige en tokens staan alleen gehasht in de database", () => {
  const a = repo.createToken(owner.id, "reset", 60_000);
  const b = repo.createToken(owner.id, "reset", 60_000);
  assert.equal(repo.consumeToken(a, "reset"), undefined);
  assert.equal(repo.consumeToken(b, "reset"), owner.id);
  const raw = repo.createToken(owner.id, "reset", 60_000);
  const rows = db().prepare("SELECT token_hash FROM tokens").all() as { token_hash: string }[];
  assert.ok(rows.every((r) => r.token_hash !== raw));
});

test("wachtwoord wijzigen en sessies intrekken", () => {
  const h = session(owner.id);
  assert.ok(repo.userForSession(h));
  repo.setUserPassword(owner.id, hashPassword("nieuw-lang-wachtwoord"));
  repo.deleteSessionsForUser(owner.id);
  assert.equal(repo.userForSession(h), undefined);
  const u = repo.findUserByEmail("eva@example.nl")!;
  assert.equal(verifyPassword("nieuw-lang-wachtwoord", u.passwordHash), true);
  assert.equal(verifyPassword("een-lang-wachtwoord", u.passwordHash), false);
});

test("superadmin is gescheiden van rijscholen-gebruikers", () => {
  const admin = repo.upsertAdmin("beheer@example.nl", "Beheer", hashPassword("admin-wachtwoord-123"));
  const t = `adm-${Math.random()}`;
  repo.insertAdminSession(sha(t), admin.id, new Date(Date.now() + 3_600_000));
  assert.equal(repo.adminForSession(sha(t))?.email, "beheer@example.nl");
  assert.equal(repo.userForSession(sha(t)), undefined); // admin-token is geen gebruikerssessie
  assert.equal(repo.findUserByEmail("beheer@example.nl"), undefined);
});

test("wachtwoordeisen en rate limit", () => {
  assert.ok(passwordProblem("kort"));
  assert.equal(passwordProblem("een-lang-wachtwoord"), undefined);
  assert.equal(allow("k", 2, 1000), true);
  assert.equal(allow("k", 2, 1000), true);
  assert.equal(allow("k", 2, 1000), false);
});

test("sessies van een geschorste rijschool worden ingetrokken en leven niet op bij heractivering", () => {
  const t = repo.createTenantWithOwner({ tenantName: "Drie", name: "Dirk", email: "dirk@example.nl", passwordHash: "x:y" });
  repo.verifyUserEmail(t.id);
  repo.setTenantStatus(t.tenantId, "approved");
  const h = session(t.id);
  assert.ok(repo.userForSession(h));
  repo.setTenantStatus(t.tenantId, "suspended");
  repo.deleteSessionsForTenant(t.tenantId);
  repo.setTenantStatus(t.tenantId, "approved");
  assert.equal(repo.userForSession(h), undefined);
});
