import { categoryForProduct, type AuthCategory, type Product } from "./types.ts";

/**
 * Regels rond machtigingen (puur, zonder database of netwerk).
 *
 * Bronnen: CBR-uitleg voor leerlingen. Een machtiging is 1 jaar geldig; de rijschool kan alleen een
 * examen reserveren dat vóór de einddatum valt. Het CBR blijft leidend: weigert het alsnog, dan
 * tonen we dat netjes en markeren we de machtiging.
 */

export type AuthStatus = "actief" | "niet_meer_zichtbaar" | "geweigerd" | "ingetrokken";
export type AuthSource = "cbr" | "handmatig";

export interface StoredAuthorization {
  id: string;
  candidateId: string;
  category: AuthCategory;
  validUntil: string; // YYYY-MM-DD
  source: AuthSource;
  status: AuthStatus;
  /** Laatste moment waarop het CBR deze machtiging bevestigde (alleen source=cbr). */
  verifiedAt: string | null;
}

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });
/** Kalenderdatum (YYYY-MM-DD) in Nederlandse tijd. */
export const amsterdamDate = (d: string | Date) => fmt.format(typeof d === "string" ? new Date(d) : d);

export type UsabilityReason = "geen" | "status" | "niet-geverifieerd" | "verlopen" | "na-einddatum";
export type Usability = { ok: true } | { ok: false; reason: UsabilityReason };

export const REASON_TEXT: Record<UsabilityReason, string> = {
  geen: "Voor deze leerling is geen machtiging bekend voor deze examensoort.",
  status: "De machtiging is niet (meer) actief.",
  "niet-geverifieerd": "Alleen machtigingen die het CBR bevestigt tellen; deze is handmatig ingevoerd.",
  verlopen: "De machtiging is verlopen.",
  "na-einddatum": "Het examen valt na de einddatum van de machtiging.",
};

/**
 * Mag je met deze machtiging reserveren?
 * - listMode: het CBR levert een overzicht; alleen door het CBR bevestigde machtigingen tellen.
 * - fallback (geen overzicht): handmatig ingevoerde machtigingen tellen mee; het CBR controleert bij reserveren.
 */
export function usability(
  a: StoredAuthorization,
  o: { listMode: boolean; today: Date; examStartsAt?: string },
): Usability {
  if (a.status !== "actief") return { ok: false, reason: "status" };
  if (o.listMode && a.source !== "cbr") return { ok: false, reason: "niet-geverifieerd" };
  if (a.validUntil < amsterdamDate(o.today)) return { ok: false, reason: "verlopen" };
  // Eindatum telt als laatste geldige dag; bij twijfel beslist het CBR.
  if (o.examStartsAt && amsterdamDate(o.examStartsAt) > a.validUntil) return { ok: false, reason: "na-einddatum" };
  return { ok: true };
}

/** Kiest de leerlingen die voor dit product en dit moment gemachtigd zijn. */
export function eligibleCandidateIds(
  auths: StoredAuthorization[],
  product: Product,
  examStartsAt: string,
  o: { listMode: boolean; today: Date },
): Set<string> {
  const category = categoryForProduct(product);
  return new Set(
    auths
      .filter((a) => a.category === category && usability(a, { ...o, examStartsAt }).ok)
      .map((a) => a.candidateId),
  );
}

export type Tone = "ok" | "warn" | "bad" | "muted";

/** Tekst en kleur voor in de UI. */
export function describe(
  a: StoredAuthorization,
  o: { listMode: boolean; today: Date; hasActiveReservation: boolean },
): { label: string; tone: Tone } {
  const until = `t/m ${a.validUntil}`;
  switch (a.status) {
    case "geweigerd": return { label: "Door het CBR geweigerd: machtiging ontbreekt of is ingetrokken", tone: "bad" };
    case "ingetrokken": return { label: "Ingetrokken door de rijschool", tone: "muted" };
    case "niet_meer_zichtbaar":
      return o.hasActiveReservation
        ? { label: "Examen gereserveerd (staat daarom niet meer in de CBR-lijst)", tone: "muted" }
        : { label: "Niet meer zichtbaar bij het CBR: ingetrokken of verlopen?", tone: "bad" };
  }
  if (o.listMode && a.source !== "cbr") return { label: "Handmatig ingevoerd; wordt niet gebruikt nu het CBR de lijst levert", tone: "muted" };
  const today = amsterdamDate(o.today);
  if (a.validUntil < today) return { label: `Verlopen op ${a.validUntil}`, tone: "bad" };
  const soon = amsterdamDate(new Date(o.today.getTime() + 30 * 86_400_000));
  const base = a.source === "cbr" ? `Actief ${until} · bevestigd door het CBR` : `Actief ${until} · niet geverifieerd (het CBR controleert bij reserveren)`;
  if (a.validUntil <= soon) return { label: `${base} · verloopt binnenkort`, tone: "warn" };
  return { label: base, tone: a.source === "cbr" ? "ok" : "warn" };
}
