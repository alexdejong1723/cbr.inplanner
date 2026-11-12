import { CbrError, type CbrClient } from "./client";

/**
 * PLAATSHOUDER voor de echte Opleiders API-koppeling.
 *
 * De CBR publiceert (nog) geen endpoints, authenticatiedetails of OpenAPI-spec;
 * die komen via de Developer Portal na acceptatie als Leverancier. Zodra die er
 * is: implementeer hier de CbrClient-interface (HTTP via de vaste egress-proxy,
 * TLS volgens NCSC-richtlijnen, API-sleutel uit een secret store) en pas
 * alleen de mapping tussen CBR-veldnamen en src/lib/cbr/types.ts aan.
 */
export class RealCbrClient implements CbrClient {
  /** Zet op true zodra blijkt dat de Opleiders API de gemachtigde kandidaten kan teruggeven. */
  readonly supportsAuthorizationList = false;
  listAuthorizations(): never { return this.fail(); }
  private fail(): never {
    throw new CbrError(
      "UNAVAILABLE",
      "CBR-koppeling nog niet geïmplementeerd: wacht op toegang tot de Developer Portal.",
    );
  }
  listLocations(): never { return this.fail(); }
  findAvailability(): never { return this.fail(); }
  reserve(): never { return this.fail(); }
  listReservations(): never { return this.fail(); }
  cancel(): never { return this.fail(); }
}
