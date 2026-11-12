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

/**
 * Een machtiging geeft de leerling per categorie aan de rijschool, via Mijn CBR (DigiD) of
 * schriftelijk. Het CBR kent categorieën per examensoort; voor B nemen we aan dat een
 * machtiging voor "praktijk" ook herexamen en tussentijdse toets dekt. Controleer dit bij het CBR.
 */
export type AuthCategory = "B_THEORIE" | "B_PRAKTIJK";

export const AUTH_CATEGORY_LABEL: Record<AuthCategory, string> = {
  B_THEORIE: "Theorie B",
  B_PRAKTIJK: "Praktijk B",
};

export const categoryForProduct = (p: Product): AuthCategory =>
  p === "B_THEORIE" ? "B_THEORIE" : "B_PRAKTIJK";

/** Zo identificeert de rijschool een leerling richting het CBR. */
export interface CandidateIdentity {
  cbrRef?: string; // CBR-kandidaatnummer, indien bekend
  name: string;
  birthDate?: string; // YYYY-MM-DD
}

/** Een machtiging zoals het CBR die teruggeeft (of zoals de rijschool die handmatig invoert). */
export interface CbrAuthorization extends CandidateIdentity {
  birthDate: string;
  category: AuthCategory;
  validUntil: string; // YYYY-MM-DD, een machtiging is 1 jaar geldig
}

/** Leerling van de rijschool. Wordt in een eigen database beheerd, niet bij het CBR. */
export interface Candidate {
  id: string;
  name: string;
  birthDate?: string;
  cbrRef?: string;
}

export interface AvailabilityQuery {
  product: Product;
  locationId?: string;
  from: string; // ISO
  to: string; // ISO
}
