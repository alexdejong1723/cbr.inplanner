/**
 * Domeinmodel van de applicatie. Dit is bewust NIET gekoppeld aan de (nog niet
 * openbare) veldnamen van de CBR Opleiders API; de vertaalslag gebeurt in een
 * adapter (zie client.ts). Pas de adapter aan zodra de Developer Portal-spec
 * beschikbaar is.
 */

export type Product =
  | "B_PRAKTIJK"
  | "B_HEREXAMEN"
  | "B_THEORIE"
  | "B_TUSSENTIJDSE_TOETS";

export const PRODUCT_LABEL: Record<Product, string> = {
  B_PRAKTIJK: "B Praktijkexamen",
  B_HEREXAMEN: "B Praktijk-herexamen",
  B_THEORIE: "B Theorie-examen",
  B_TUSSENTIJDSE_TOETS: "B Tussentijdse toets",
};

export interface Location {
  id: string;
  name: string;
  city: string;
}

export interface Slot {
  id: string;
  product: Product;
  locationId: string;
  startsAt: string; // ISO 8601, UTC
}

export type ReservationStatus = "gereserveerd" | "geannuleerd";

export interface Reservation {
  id: string;
  candidateId: string;
  product: Product;
  locationId: string;
  startsAt: string;
  purchasedAt: string;
  status: ReservationStatus;
}

/** Leerling van de rijschool. Wordt in een eigen database beheerd, niet bij het CBR. */
export interface Candidate {
  id: string;
  name: string;
  /** Alleen bij echte koppeling: het CBR-kandidaat-/aanvraagnummer. */
  cbrReference?: string;
  /** Heeft de kandidaat de rijschool gemachtigd? Zonder machtiging mag je niets verwerken. */
  authorized: boolean;
}

export interface AvailabilityQuery {
  product: Product;
  locationId?: string;
  from: string; // ISO
  to: string; // ISO
}
