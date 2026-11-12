import type {
  AvailabilityQuery,
  Location,
  Reservation,
  Slot,
} from "./types";

/**
 * Het contract tussen de app en het CBR. De UI praat alleen tegen deze
 * interface. Er zijn twee implementaties:
 *  - MockCbrClient (nu): werkt zonder toegang, voor ontwikkeling en demo's.
 *  - RealCbrClient (later): vertaalt naar de Opleiders API zodra de CBR de
 *    specificatie en een API-sleutel heeft verstrekt.
 *
 * Alle functies zijn gescoped op één rijschool (de "opleider"); de client
 * wordt per opleider geïnstantieerd.
 */
export interface CbrClient {
  listLocations(): Promise<Location[]>;
  findAvailability(query: AvailabilityQuery): Promise<Slot[]>;
  reserve(input: { candidateId: string; slotId: string }): Promise<Reservation>;
  listReservations(): Promise<Reservation[]>;
  cancel(reservationId: string): Promise<Reservation>;
}

export class CbrError extends Error {
  constructor(
    public code:
      | "SLOT_TAKEN"
      | "NOT_FOUND"
      | "CANCEL_NOT_ALLOWED"
      | "NOT_AUTHORIZED"
      | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}
