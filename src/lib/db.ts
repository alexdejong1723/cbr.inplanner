import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * SQLite voor het prototype (bestand in ./data). De query's staan allemaal in
 * repo.ts, zodat een overstap naar Postgres (EU-regio) een kwestie is van die
 * ene laag vervangen.
 */
/**
 * Migraties: index i = versie i+1, bijgehouden in PRAGMA user_version.
 * Voeg wijzigingen ALTIJD als nieuwe migratie toe; pas bestaande nooit aan.
 */
const MIGRATIONS: string[] = [
// v1: basis
`
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('eigenaar','planner')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT,
  authorized INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_candidates_tenant ON candidates(tenant_id);
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  product TEXT NOT NULL,
  location_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  purchased_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('gereserveerd','geannuleerd')),
  cbr_reservation_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON reservations(tenant_id, starts_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, id DESC);
`,
// v2: goedkeuring rijscholen, e-mailverificatie, tokens, superadmins, dev-outbox
`
ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','approved','rejected','suspended'));
ALTER TABLE tenants ADD COLUMN reviewed_at TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
-- Bestaande omgevingen (van voor deze migratie) blijven bruikbaar.
UPDATE tenants SET status = 'approved', reviewed_at = created_at;
UPDATE users SET email_verified_at = created_at;
CREATE TABLE tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX idx_tokens_user ON tokens(user_id, purpose);
CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  at TEXT NOT NULL
);
`,
// v3: eenmanszaak-model, precies één gebruiker per rijschool (teamleden/rollen vervallen)
`
-- Bestaande extra gebruikers (teamleden) worden verwijderd; per rijschool blijft de oudste
-- eigenaar over. Hun sessies en tokens verdwijnen mee (ON DELETE CASCADE). Reserveringen die
-- zij maakten blijven bestaan en worden op de overblijvende gebruiker gezet (verplicht door de
-- foreign key). De auditlog blijft ongewijzigd; verwijderde gebruikers tonen daar als "-".
CREATE TEMP TABLE keep AS
  SELECT id, tenant_id FROM (
    SELECT id, tenant_id,
           ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY (role = 'eigenaar') DESC, created_at, id) AS rn
    FROM users
  ) WHERE rn = 1;
UPDATE reservations
   SET created_by = (SELECT id FROM keep WHERE keep.tenant_id = reservations.tenant_id)
 WHERE created_by NOT IN (SELECT id FROM keep);
DELETE FROM users WHERE id NOT IN (SELECT id FROM keep);
DROP TABLE keep;
CREATE UNIQUE INDEX idx_users_one_per_tenant ON users(tenant_id);
-- De kolom users.role blijft bestaan (SQLite kan hem niet droppen vanwege de CHECK) maar is altijd 'eigenaar'.
`,
// v4: machtigingen per leerling en categorie (vervangt het zelf aan te vinken "gemachtigd")
`
-- Het oude vinkje was een zelfverklaring zonder categorie of einddatum. Het wordt verwijderd:
-- leerlingen blijven bestaan, hun machtigingen komen van het CBR of worden opnieuw ingevoerd.
ALTER TABLE candidates DROP COLUMN authorized;
ALTER TABLE candidates ADD COLUMN birth_date TEXT;
ALTER TABLE candidates ADD COLUMN cbr_ref TEXT;
CREATE UNIQUE INDEX idx_candidates_cbr_ref ON candidates(tenant_id, cbr_ref) WHERE cbr_ref IS NOT NULL;
ALTER TABLE tenants ADD COLUMN authorizations_synced_at TEXT;
CREATE TABLE authorizations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  category TEXT NOT NULL CHECK (category IN ('B_THEORIE','B_PRAKTIJK')),
  valid_until TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('cbr','handmatig')),
  status TEXT NOT NULL CHECK (status IN ('actief','niet_meer_zichtbaar','geweigerd','ingetrokken')),
  verified_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (candidate_id, category)
);
CREATE INDEX idx_authorizations_tenant ON authorizations(tenant_id);
`,
// v5: CBR-opleidernummer per rijschool (nodig voor de uitleg aan leerlingen)
`
ALTER TABLE tenants ADD COLUMN opleidernummer TEXT;
`,
];

function migrate(d: DatabaseSync) {
  const current = (d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    d.exec("BEGIN");
    try {
      d.exec(MIGRATIONS[v]);
      d.exec(`PRAGMA user_version = ${v + 1}`);
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  }
}

const g = globalThis as unknown as { __db?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__db) return g.__db;
  const path = process.env.DATABASE_PATH ?? "./data/app.db";
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") d.exec("PRAGMA journal_mode = WAL");
  migrate(d);
  g.__db = d;
  return d;
}
