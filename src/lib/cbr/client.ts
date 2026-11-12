import type {
  AvailabilityQuery,
  CandidateIdentity,
  CbrAuthorization,
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
  /**
   * Levert het CBR een overzicht van de leerlingen die deze rijschool hebben gemachtigd?
   * Zo ja: dat overzicht is leidend (zie listAuthorizations). Zo nee: de rijschool voert
   * machtigingen handmatig in en het CBR controleert bij het reserveren.
   */
  readonly supportsAuthorizationList: boolean;
  /** Gemachtigde leerlingen met categorie en einddatum. Alleen aanroepen als supportsAuthorizationList. */
  listAuthorizations(): Promise<CbrAuthorization[]>;
  listLocations(): Promise<Location[]>;
  findAvailability(query: AvailabilityQuery): Promise<Slot[]>;
  /**
   * `candidateId` is ons eigen id en komt ongewijzigd terug in de Reservation;
   * `candidate` is hoe het CBR de leerling herkent. Gooit NOT_AUTHORIZED als er geen geldige machtiging is.
   */
  reserve(input: { candidateId: string; candidate: CandidateIdentity; slotId: string }): Promise<Reservation>;
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
      | "UNSUPPORTED"
      | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}
