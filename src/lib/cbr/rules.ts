import type { Product, Reservation } from "./types";

/**
 * Reserveringsregels voor B-producten, geldig vanaf 1 april 2027
 * (bron: cbr.nl/nl/voor-opleiders/nl/digitaal-reserveringssysteem):
 *  1. Ruilen of verplaatsen van gereserveerde plekken kan niet meer.
 *  2. Annuleren is kosteloos tot 28 dagen voor het examen, of binnen 48 uur
 *     na aankoop.
 *  3. Vrijgekomen plekken komen terug in het systeem en worden op wisselende
 *     momenten weer beschikbaar.
 */

export const NEW_RULES_START = new Date("2027-04-01T00:00:00+02:00");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const B_PRODUCTS: ReadonlySet<Product> = new Set([
  "B_PRAKTIJK",
  "B_HEREXAMEN",
  "B_THEORIE",
  "B_TUSSENTIJDSE_TOETS",
]);

export function newRulesApply(product: Product, now: Date): boolean {
  return B_PRODUCTS.has(product) && now >= NEW_RULES_START;
}

export type CancelDecision =
  | { allowed: true; reason: "binnen-48-uur" | "meer-dan-28-dagen" | "oude-regels" }
  | { allowed: false; reason: "te-laat" | "al-geannuleerd" | "verstreken" };

export function canCancel(r: Reservation, now: Date): CancelDecision {
  if (r.status === "geannuleerd") return { allowed: false, reason: "al-geannuleerd" };
  const start = new Date(r.startsAt).getTime();
  if (start <= now.getTime()) return { allowed: false, reason: "verstreken" };
  // Voor de overgangsperiode (TOP internet) is geen nieuwe beperking bekend.
  if (!newRulesApply(r.product, now)) return { allowed: true, reason: "oude-regels" };
  if (now.getTime() - new Date(r.purchasedAt).getTime() <= 48 * HOUR)
    return { allowed: true, reason: "binnen-48-uur" };
  if (start - now.getTime() >= 28 * DAY)
    return { allowed: true, reason: "meer-dan-28-dagen" };
  return { allowed: false, reason: "te-laat" };
}

/** Onder de nieuwe regels kan een reservering niet meer worden verplaatst of geruild. */
export function canMove(r: Reservation, now: Date): boolean {
  return !newRulesApply(r.product, now);
}

/** Laatste moment waarop kosteloos annuleren nog kan (voor weergave in de UI). */
export function freeCancelDeadline(r: Reservation): Date {
  const byStart = new Date(new Date(r.startsAt).getTime() - 28 * DAY);
  const byPurchase = new Date(new Date(r.purchasedAt).getTime() + 48 * HOUR);
  return byStart > byPurchase ? byStart : byPurchase;
}

export const CANCEL_REASON_TEXT: Record<string, string> = {
  "binnen-48-uur": "Binnen 48 uur na aankoop",
  "meer-dan-28-dagen": "Meer dan 28 dagen voor het examen",
  "oude-regels": "Huidige regels (TOP internet)",
  "te-laat": "Kosteloos annuleren niet meer mogelijk",
  "al-geannuleerd": "Al geannuleerd",
  verstreken: "Examen is al geweest",
};
