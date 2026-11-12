import { getCbrClient } from "./cbr";
import * as repo from "./repo";

/**
 * Haalt het overzicht van gemachtigde leerlingen op bij het CBR en slaat het lokaal op.
 *
 * Eerlijk gebruik (voorwaarde van het CBR: het reserveringssysteem niet overbelasten):
 *  - lazy: pas weer ophalen als het overzicht ouder is dan AUTH_SYNC_TTL_MS (standaard 5 min);
 *  - handmatig verversen of na een reservering ("force") mag vaker, maar niet vaker dan
 *    elke AUTH_SYNC_MIN_INTERVAL_MS (standaard 15 s);
 *  - bij een fout (bijv. 's nachts, wanneer de API niet beschikbaar is) blijft het laatst bekende overzicht staan.
 */
const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);

export type SyncResult = {
  status: "ok" | "te-vers" | "niet-ondersteund" | "fout";
  syncedAt: string | null;
  message?: string;
};

export async function syncAuthorizations(tenantId: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const client = getCbrClient(tenantId);
  const last = repo.getAuthorizationsSyncedAt(tenantId);
  if (!client.supportsAuthorizationList) return { status: "niet-ondersteund", syncedAt: last };

  const ttl = opts.force ? num(process.env.AUTH_SYNC_MIN_INTERVAL_MS, 15_000) : num(process.env.AUTH_SYNC_TTL_MS, 300_000);
  const age = last ? Date.now() - Date.parse(last) : Infinity;
  if (age < ttl) return { status: "te-vers", syncedAt: last };

  try {
    const list = await client.listAuthorizations();
    return { status: "ok", syncedAt: repo.applyCbrAuthorizations(tenantId, list) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Onbekende fout";
    console.error("Machtigingen ophalen mislukt:", message);
    return { status: "fout", syncedAt: last, message };
  }
}
