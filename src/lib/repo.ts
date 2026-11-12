import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./db.ts";
import type { StoredAuthorization } from "./cbr/authorizations.ts";
import type { AuthCategory, Candidate, CandidateIdentity, CbrAuthorization, Product, Reservation } from "./cbr/types.ts";

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

/** Eenmanszaak: elke rijschool heeft precies één gebruiker (de eigenaar, tevens opleider). */
export interface User { id: string; tenantId: string; email: string; name: string }
export type TenantStatus = "pending" | "approved" | "rejected" | "suspended";
export interface UserWithHash extends User {
  passwordHash: string;
  emailVerified: boolean;
  tenantStatus: TenantStatus;
}
export interface Tenant { id: string; name: string; status: TenantStatus }

const toUser = (r: Row): User => ({
  id: r.id as string, tenantId: r.tenant_id as string, email: r.email as string,
  name: r.name as string,
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
  return { id: userId, tenantId, email: i.email, name: i.name };
}

export function findUserByEmail(email: string): UserWithHash | undefined {
  const r = one(
    `SELECT u.*, t.status AS tenant_status FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ?`,
    email,
  );
  return r && {
    ...toUser(r),
    passwordHash: r.password_hash as string,
    emailVerified: r.email_verified_at !== null,
    tenantStatus: r.tenant_status as TenantStatus,
  };
}

export function verifyUserEmail(userId: string) {
  run("UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL", now(), userId);
}

export function setUserPassword(userId: string, passwordHash: string) {
  run("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, userId);
}

export function getUserById(userId: string): User | undefined {
  const r = one("SELECT * FROM users WHERE id = ?", userId);
  return r && toUser(r);
}

export function getTenant(tenantId: string): Tenant | undefined {
  const r = one("SELECT id, name, status FROM tenants WHERE id = ?", tenantId);
  return r && { id: r.id as string, name: r.name as string, status: r.status as TenantStatus };
}

// ---------- Sessies ----------

export function insertSession(tokenHash: string, userId: string, expiresAt: Date) {
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)", tokenHash, userId, expiresAt.toISOString());
}
export function deleteSession(tokenHash: string) { run("DELETE FROM sessions WHERE token_hash = ?", tokenHash); }
export function deleteSessionsForUser(userId: string) { run("DELETE FROM sessions WHERE user_id = ?", userId); }
export function deleteSessionsForTenant(tenantId: string) {
  run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)", tenantId);
}
/**
 * Een sessie telt alleen als het e-mailadres bevestigd is EN de rijschool is
 * goedgekeurd. Wordt een rijschool later geschorst, dan werkt elke bestaande
 * sessie direct niet meer.
 */
export function userForSession(tokenHash: string): User | undefined {
  const r = one(
    `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN tenants t ON t.id = u.tenant_id
     WHERE s.token_hash = ? AND s.expires_at > ?
       AND u.email_verified_at IS NOT NULL AND t.status = 'approved'`,
    tokenHash, now());
  return r && toUser(r);
}

// ---------- Tokens (e-mailverificatie, wachtwoord resetten) ----------

export type TokenPurpose = "verify" | "reset";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Maakt een eenmalig token; eerdere tokens met hetzelfde doel voor deze gebruiker vervallen. */
export function createToken(userId: string, purpose: TokenPurpose, ttlMs: number): string {
  const raw = randomBytes(32).toString("base64url");
  run("DELETE FROM tokens WHERE user_id = ? AND purpose = ?", userId, purpose);
  run("INSERT INTO tokens (token_hash, user_id, purpose, expires_at) VALUES (?,?,?,?)",
    sha(raw), userId, purpose, new Date(Date.now() + ttlMs).toISOString());
  return raw;
}

/** Controleert zonder te verbruiken (voor het tonen van het formulier). */
export function peekToken(raw: string, purpose: TokenPurpose): boolean {
  return !!one("SELECT 1 AS x FROM tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?",
    sha(raw), purpose, now());
}

/** Verbruikt het token atomair; geeft de gebruiker terug, of undefined als ongeldig/gebruikt/verlopen. */
export function consumeToken(raw: string, purpose: TokenPurpose): string | undefined {
  const h = sha(raw);
  const res = run("UPDATE tokens SET used_at = ? WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?",
    now(), h, purpose, now());
  if (Number(res.changes) !== 1) return undefined;
  return one("SELECT user_id FROM tokens WHERE token_hash = ?", h)?.user_id as string | undefined;
}

// ---------- Beheerders (superadmin) en goedkeuring van rijscholen ----------

export interface Admin { id: string; email: string; name: string }
export interface AdminWithHash extends Admin { passwordHash: string }

export function upsertAdmin(email: string, name: string, passwordHash: string): Admin {
  const existing = one("SELECT id FROM admins WHERE email = ?", email);
  if (existing) {
    run("UPDATE admins SET name = ?, password_hash = ? WHERE id = ?", name, passwordHash, existing.id as string);
    run("DELETE FROM admin_sessions WHERE admin_id = ?", existing.id as string);
    return { id: existing.id as string, email, name };
  }
  const id = randomUUID();
  run("INSERT INTO admins (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)", id, email, name, passwordHash, now());
  return { id, email, name };
}
export function findAdminByEmail(email: string): AdminWithHash | undefined {
  const r = one("SELECT * FROM admins WHERE email = ?", email);
  return r && { id: r.id as string, email: r.email as string, name: r.name as string, passwordHash: r.password_hash as string };
}
export function insertAdminSession(tokenHash: string, adminId: string, expiresAt: Date) {
  run("INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?,?,?)", tokenHash, adminId, expiresAt.toISOString());
}
export function deleteAdminSession(tokenHash: string) { run("DELETE FROM admin_sessions WHERE token_hash = ?", tokenHash); }
export function adminForSession(tokenHash: string): Admin | undefined {
  const r = one(
    `SELECT a.* FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    tokenHash, now());
  return r && { id: r.id as string, email: r.email as string, name: r.name as string };
}

export interface TenantOverview {
  id: string; name: string; status: TenantStatus; createdAt: string;
  ownerName: string; ownerEmail: string; ownerVerified: boolean;
}
export function listTenantsForAdmin(status: TenantStatus): TenantOverview[] {
  return all(
    `SELECT t.id, t.name, t.status, t.created_at,
            o.name AS owner_name, o.email AS owner_email, o.email_verified_at AS owner_verified
     FROM tenants t
     JOIN users o ON o.tenant_id = t.id
     WHERE t.status = ? ORDER BY t.created_at DESC`, status,
  ).map((r) => ({
    id: r.id as string, name: r.name as string, status: r.status as TenantStatus, createdAt: r.created_at as string,
    ownerName: r.owner_name as string, ownerEmail: r.owner_email as string, ownerVerified: r.owner_verified !== null,
  }));
}
export function countTenantsByStatus(): Record<TenantStatus, number> {
  const out: Record<TenantStatus, number> = { pending: 0, approved: 0, rejected: 0, suspended: 0 };
  for (const r of all("SELECT status, COUNT(*) AS n FROM tenants GROUP BY status")) out[r.status as TenantStatus] = Number(r.n);
  return out;
}
/** De (enige) gebruiker van de rijschool. */
export function getTenantOwner(tenantId: string): (User & { emailVerified: boolean }) | undefined {
  const r = one("SELECT * FROM users WHERE tenant_id = ?", tenantId);
  return r && { ...toUser(r), emailVerified: r.email_verified_at !== null };
}

const TRANSITIONS: Record<TenantStatus, TenantStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["suspended"],
  suspended: ["approved"],
  rejected: ["approved"],
};
/** Wijzigt de status volgens de toegestane overgangen. Geeft false als de overgang niet mag. */
export function setTenantStatus(tenantId: string, to: TenantStatus): boolean {
  const t = getTenant(tenantId);
  if (!t || !TRANSITIONS[t.status].includes(to)) return false;
  run("UPDATE tenants SET status = ?, reviewed_at = ? WHERE id = ?", to, now(), tenantId);
  return true;
}

// ---------- Dev-outbox (alleen gebruikt zonder SMTP in ontwikkeling) ----------

export function insertOutbox(to: string, subject: string, body: string) {
  run("INSERT INTO outbox (to_addr, subject, body, at) VALUES (?,?,?,?)", to, subject, body, now());
}

// ---------- Leerlingen ----------

const toCandidate = (r: Row): Candidate => ({
  id: r.id as string, name: r.name as string,
  birthDate: (r.birth_date as string | null) ?? undefined,
  cbrRef: (r.cbr_ref as string | null) ?? undefined,
});

export function listCandidates(tenantId: string): Candidate[] {
  return all("SELECT * FROM candidates WHERE tenant_id = ? ORDER BY name", tenantId).map(toCandidate);
}
export function getCandidate(tenantId: string, id: string): Candidate | undefined {
  const r = one("SELECT * FROM candidates WHERE tenant_id = ? AND id = ?", tenantId, id);
  return r && toCandidate(r);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Zoekt een leerling binnen deze rijschool op CBR-nummer, anders op naam + geboortedatum. */
function findCandidate(tenantId: string, i: CandidateIdentity): Row | undefined {
  if (i.cbrRef) {
    const r = one("SELECT * FROM candidates WHERE tenant_id = ? AND cbr_ref = ?", tenantId, i.cbrRef);
    if (r) return r;
  }
  if (!i.birthDate) return undefined;
  return all("SELECT * FROM candidates WHERE tenant_id = ? AND birth_date = ?", tenantId, i.birthDate)
    .find((r) => norm(r.name as string) === norm(i.name));
}

function upsertCandidate(tenantId: string, i: CandidateIdentity): string {
  const existing = findCandidate(tenantId, i);
  if (existing) {
    // Vul ontbrekende gegevens aan (bijv. CBR-nummer van een eerder handmatig ingevoerde leerling).
    if (!existing.cbr_ref && i.cbrRef) run("UPDATE candidates SET cbr_ref = ? WHERE id = ?", i.cbrRef, existing.id as string);
    if (!existing.birth_date && i.birthDate) run("UPDATE candidates SET birth_date = ? WHERE id = ?", i.birthDate, existing.id as string);
    return existing.id as string;
  }
  const id = randomUUID();
  run("INSERT INTO candidates (id, tenant_id, name, birth_date, cbr_ref, created_at) VALUES (?,?,?,?,?,?)",
    id, tenantId, i.name.trim(), i.birthDate ?? null, i.cbrRef ?? null, now());
  return id;
}

// ---------- Machtigingen ----------

const toAuth = (r: Row): StoredAuthorization => ({
  id: r.id as string, candidateId: r.candidate_id as string, category: r.category as AuthCategory,
  validUntil: r.valid_until as string, source: r.source as StoredAuthorization["source"],
  status: r.status as StoredAuthorization["status"], verifiedAt: (r.verified_at as string | null) ?? null,
});

export function listAuthorizations(tenantId: string): StoredAuthorization[] {
  return all("SELECT * FROM authorizations WHERE tenant_id = ? ORDER BY category", tenantId).map(toAuth);
}
export function getAuthorization(tenantId: string, candidateId: string, category: AuthCategory): StoredAuthorization | undefined {
  const r = one("SELECT * FROM authorizations WHERE tenant_id = ? AND candidate_id = ? AND category = ?", tenantId, candidateId, category);
  return r && toAuth(r);
}
export function getAuthorizationById(tenantId: string, id: string): StoredAuthorization | undefined {
  const r = one("SELECT * FROM authorizations WHERE tenant_id = ? AND id = ?", tenantId, id);
  return r && toAuth(r);
}
export function setAuthorizationStatus(tenantId: string, id: string, status: StoredAuthorization["status"]) {
  run("UPDATE authorizations SET status = ? WHERE tenant_id = ? AND id = ?", status, tenantId, id);
}
export function getAuthorizationsSyncedAt(tenantId: string): string | null {
  return (one("SELECT authorizations_synced_at AS t FROM tenants WHERE id = ?", tenantId)?.t as string | null) ?? null;
}

/**
 * Verwerkt het overzicht van het CBR (leidend):
 *  - machtigingen in de lijst worden aangemaakt of bijgewerkt en zijn weer 'actief';
 *  - eerder door het CBR bevestigde machtigingen die NIET meer in de lijst staan worden
 *    'niet_meer_zichtbaar'. Dat betekent niet per se ingetrokken: in TOP internet verdwijnt een
 *    leerling ook uit de lijst zodra er een examen voor is aangevraagd.
 * Handmatig ingevoerde machtigingen worden hier nooit aangeraakt, behalve dat het CBR ze kan bevestigen.
 */
export function applyCbrAuthorizations(tenantId: string, list: CbrAuthorization[]): string {
  const at = now();
  const d = db();
  d.exec("BEGIN");
  try {
    const seen: string[] = [];
    for (const a of list) {
      const candidateId = upsertCandidate(tenantId, a);
      const existing = getAuthorization(tenantId, candidateId, a.category);
      if (existing) {
        run("UPDATE authorizations SET source = 'cbr', status = 'actief', valid_until = ?, verified_at = ? WHERE id = ?", a.validUntil, at, existing.id);
        seen.push(existing.id);
      } else {
        const id = randomUUID();
        run("INSERT INTO authorizations (id, tenant_id, candidate_id, category, valid_until, source, status, verified_at, created_at) VALUES (?,?,?,?,?, 'cbr', 'actief', ?, ?)",
          id, tenantId, candidateId, a.category, a.validUntil, at, at);
        seen.push(id);
      }
    }
    const gone = listAuthorizations(tenantId).filter((x) => x.source === "cbr" && x.status === "actief" && !seen.includes(x.id));
    for (const x of gone) run("UPDATE authorizations SET status = 'niet_meer_zichtbaar' WHERE id = ?", x.id);
    run("UPDATE tenants SET authorizations_synced_at = ? WHERE id = ?", at, tenantId);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return at;
}

export type ManualAuthResult =
  | { ok: true; candidateId: string; authorizationId: string }
  | { ok: false; reason: "bevestigd-door-cbr" };

/** Terugvaloptie: de rijschool voert zelf een machtiging in (niet geverifieerd). */
export function upsertManualAuthorization(
  tenantId: string,
  i: CandidateIdentity & { birthDate: string; category: AuthCategory; validUntil: string },
): ManualAuthResult {
  const d = db();
  d.exec("BEGIN");
  try {
    const candidateId = upsertCandidate(tenantId, i);
    const existing = getAuthorization(tenantId, candidateId, i.category);
    let id: string;
    if (existing) {
      if (existing.source === "cbr" && existing.status === "actief") { d.exec("ROLLBACK"); return { ok: false, reason: "bevestigd-door-cbr" }; }
      run("UPDATE authorizations SET source = 'handmatig', status = 'actief', valid_until = ?, verified_at = NULL WHERE id = ?", i.validUntil, existing.id);
      id = existing.id;
    } else {
      id = randomUUID();
      run("INSERT INTO authorizations (id, tenant_id, candidate_id, category, valid_until, source, status, verified_at, created_at) VALUES (?,?,?,?,?, 'handmatig', 'actief', NULL, ?)",
        id, tenantId, candidateId, i.category, i.validUntil, now());
    }
    d.exec("COMMIT");
    return { ok: true, candidateId, authorizationId: id };
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
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
