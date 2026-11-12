import { randomUUID } from "node:crypto";
import { db } from "./db.ts";
import type { Candidate, Product, Reservation } from "./cbr/types.ts";

/**
 * ALLE toegang tot tenant-gegevens loopt via deze functies, en elke functie
 * krijgt expliciet een tenantId. Die komt altijd uit de sessie op de server,
 * nooit uit een formulier of URL. Zo kan een rijschool nooit andermans data
 * zien of wijzigen, ook niet door een id te raden.
 */

const now = () => new Date().toISOString();
type Row = Record<string, string | number | null>;
const all = (sql: string, ...p: (string | number | null)[]) => db().prepare(sql).all(...p) as Row[];
const one = (sql: string, ...p: (string | number | null)[]) => db().prepare(sql).get(...p) as Row | undefined;
const run = (sql: string, ...p: (string | number | null)[]) => db().prepare(sql).run(...p);

// ---------- Rijscholen & gebruikers ----------

export type Role = "eigenaar" | "planner";
export interface User { id: string; tenantId: string; email: string; name: string; role: Role }
export interface UserWithHash extends User { passwordHash: string }
export interface Tenant { id: string; name: string }

const toUser = (r: Row): User => ({
  id: r.id as string, tenantId: r.tenant_id as string, email: r.email as string,
  name: r.name as string, role: r.role as Role,
});

export function createTenantWithOwner(i: { tenantName: string; name: string; email: string; passwordHash: string }): User {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const d = db();
  d.exec("BEGIN");
  try {
    run("INSERT INTO tenants (id, name, created_at) VALUES (?,?,?)", tenantId, i.tenantName, now());
    run("INSERT INTO users (id, tenant_id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?, 'eigenaar', ?)",
      userId, tenantId, i.email, i.name, i.passwordHash, now());
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  audit(tenantId, userId, "rijschool.aangemaakt", i.tenantName);
  return { id: userId, tenantId, email: i.email, name: i.name, role: "eigenaar" };
}

export function addUser(tenantId: string, i: { name: string; email: string; passwordHash: string; role: Role }): User {
  const id = randomUUID();
  run("INSERT INTO users (id, tenant_id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)",
    id, tenantId, i.email, i.name, i.passwordHash, i.role, now());
  return { id, tenantId, email: i.email, name: i.name, role: i.role };
}

export function findUserByEmail(email: string): UserWithHash | undefined {
  const r = one("SELECT * FROM users WHERE email = ?", email);
  return r && { ...toUser(r), passwordHash: r.password_hash as string };
}

export function listUsers(tenantId: string): User[] {
  return all("SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at", tenantId).map(toUser);
}

export function getTenant(tenantId: string): Tenant | undefined {
  const r = one("SELECT id, name FROM tenants WHERE id = ?", tenantId);
  return r && { id: r.id as string, name: r.name as string };
}

// ---------- Sessies ----------

export function insertSession(tokenHash: string, userId: string, expiresAt: Date) {
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)", tokenHash, userId, expiresAt.toISOString());
}
export function deleteSession(tokenHash: string) { run("DELETE FROM sessions WHERE token_hash = ?", tokenHash); }
export function userForSession(tokenHash: string): User | undefined {
  const r = one(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`, tokenHash, now());
  return r && toUser(r);
}

// ---------- Leerlingen ----------

const toCandidate = (r: Row): Candidate => ({
  id: r.id as string, name: r.name as string, authorized: r.authorized === 1,
});

export function listCandidates(tenantId: string): Candidate[] {
  return all("SELECT * FROM candidates WHERE tenant_id = ? ORDER BY name", tenantId).map(toCandidate);
}
export function getCandidate(tenantId: string, id: string): Candidate | undefined {
  const r = one("SELECT * FROM candidates WHERE tenant_id = ? AND id = ?", tenantId, id);
  return r && toCandidate(r);
}
export function addCandidate(tenantId: string, name: string, authorized: boolean): Candidate {
  const id = randomUUID();
  run("INSERT INTO candidates (id, tenant_id, name, authorized, created_at) VALUES (?,?,?,?,?)",
    id, tenantId, name, authorized ? 1 : 0, now());
  return { id, name, authorized };
}
export function setCandidateAuthorized(tenantId: string, id: string, authorized: boolean) {
  run("UPDATE candidates SET authorized = ? WHERE tenant_id = ? AND id = ?", authorized ? 1 : 0, tenantId, id);
}

// ---------- Reserveringen ----------

const toReservation = (r: Row): Reservation => ({
  id: r.id as string, candidateId: r.candidate_id as string, product: r.product as Product,
  locationId: r.location_id as string, startsAt: r.starts_at as string,
  purchasedAt: r.purchased_at as string, status: r.status as Reservation["status"],
});

export function listReservations(tenantId: string): Reservation[] {
  return all("SELECT * FROM reservations WHERE tenant_id = ? ORDER BY starts_at", tenantId).map(toReservation);
}
export function getReservation(tenantId: string, id: string): (Reservation & { cbrReservationId: string }) | undefined {
  const r = one("SELECT * FROM reservations WHERE tenant_id = ? AND id = ?", tenantId, id);
  return r && { ...toReservation(r), cbrReservationId: r.cbr_reservation_id as string };
}
export function insertReservation(tenantId: string, userId: string, r: Reservation) {
  run(`INSERT INTO reservations (id, tenant_id, candidate_id, product, location_id, starts_at, purchased_at, status, cbr_reservation_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    randomUUID(), tenantId, r.candidateId, r.product, r.locationId, r.startsAt, r.purchasedAt, r.status, r.id, userId);
}
export function markCancelled(tenantId: string, id: string) {
  run("UPDATE reservations SET status = 'geannuleerd' WHERE tenant_id = ? AND id = ?", tenantId, id);
}

// ---------- Auditlog ----------

export function audit(tenantId: string, userId: string | null, action: string, detail: string) {
  run("INSERT INTO audit_log (tenant_id, user_id, action, detail, at) VALUES (?,?,?,?,?)", tenantId, userId, action, detail, now());
}
export function listAudit(tenantId: string, limit = 100) {
  return all(
    `SELECT a.action, a.detail, a.at, u.name AS user_name FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id WHERE a.tenant_id = ? ORDER BY a.id DESC LIMIT ?`,
    tenantId, limit,
  ).map((r) => ({ action: r.action as string, detail: r.detail as string, at: r.at as string, userName: (r.user_name as string) ?? "-" }));
}
