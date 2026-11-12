import { CbrError, type CbrClient } from "./client";
import type {
  AvailabilityQuery,
  Candidate,
  Location,
  Reservation,
  Slot,
} from "./types";

const LOCATIONS: Location[] = [
  { id: "ams", name: "CBR Amsterdam", city: "Amsterdam" },
  { id: "utr", name: "CBR Utrecht", city: "Utrecht" },
  { id: "rtd", name: "CBR Rotterdam", city: "Rotterdam" },
  { id: "eht", name: "CBR Eindhoven", city: "Eindhoven" },
];

export const MOCK_CANDIDATES: Candidate[] = [
  { id: "c1", name: "Sanne Bakker", authorized: true },
  { id: "c2", name: "Mohamed El Idrissi", authorized: true },
  { id: "c3", name: "Lotte Visser", authorized: true },
  { id: "c4", name: "Daan Smit", authorized: false },
];

interface Store {
  taken: Set<string>;
  reservations: Reservation[];
}

// Overleeft hot-reload in dev; vervangt later de echte CBR-state.
const g = globalThis as unknown as { __cbrMock?: Store };
const store: Store = (g.__cbrMock ??= { taken: new Set(), reservations: [] });

/** Deterministische sloten: werkdagen, 08:30-15:30, per locatie en product. */
function generateSlots(q: AvailabilityQuery): Slot[] {
  const out: Slot[] = [];
  const from = new Date(q.from);
  const to = new Date(q.to);
  const locs = q.locationId ? [q.locationId] : LOCATIONS.map((l) => l.id);
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const loc of locs) {
      for (const hour of [7, 8, 10, 12, 13]) {
        const start = new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 30),
        );
        const id = `${q.product}|${loc}|${start.toISOString()}`;
        // Pseudo-schaarste: ongeveer een derde van de plekken is al weg.
        const hash = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        if (hash % 3 === 0 || store.taken.has(id)) continue;
        out.push({ id, product: q.product, locationId: loc, startsAt: start.toISOString() });
      }
    }
  }
  return out;
}

export class MockCbrClient implements CbrClient {
  async listLocations() {
    return LOCATIONS;
  }

  async findAvailability(q: AvailabilityQuery) {
    return generateSlots(q).slice(0, 60);
  }

  async reserve({ candidateId, slotId }: { candidateId: string; slotId: string }) {
    const candidate = MOCK_CANDIDATES.find((c) => c.id === candidateId);
    if (!candidate?.authorized)
      throw new CbrError("NOT_AUTHORIZED", "Kandidaat heeft de rijschool niet gemachtigd.");
    if (store.taken.has(slotId))
      throw new CbrError("SLOT_TAKEN", "Deze plek is net door iemand anders gereserveerd.");
    const [product, locationId, startsAt] = slotId.split("|");
    store.taken.add(slotId);
    const r: Reservation = {
      id: crypto.randomUUID(),
      candidateId,
      product: product as Reservation["product"],
      locationId,
      startsAt,
      purchasedAt: new Date().toISOString(),
      status: "gereserveerd",
    };
    store.reservations.push(r);
    return r;
  }

  async listReservations() {
    return [...store.reservations].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async cancel(reservationId: string) {
    const r = store.reservations.find((x) => x.id === reservationId);
    if (!r) throw new CbrError("NOT_FOUND", "Reservering niet gevonden.");
    r.status = "geannuleerd";
    // Conform CBR-regel 3: vrijgekomen plek komt later terug; in de mock direct.
    store.taken.delete(`${r.product}|${r.locationId}|${r.startsAt}`);
    return r;
  }
}
