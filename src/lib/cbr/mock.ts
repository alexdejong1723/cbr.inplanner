import { CbrError, type CbrClient } from "./client";
import { amsterdamDate } from "./authorizations";
import {
  categoryForProduct,
  type AvailabilityQuery, type CandidateIdentity, type CbrAuthorization, type Location, type Product,
  type Reservation, type Slot,
} from "./types";

const LOCATIONS: Location[] = [
  { id: "ams", name: "CBR Amsterdam", city: "Amsterdam" },
  { id: "utr", name: "CBR Utrecht", city: "Utrecht" },
  { id: "rtd", name: "CBR Rotterdam", city: "Rotterdam" },
  { id: "eht", name: "CBR Eindhoven", city: "Eindhoven" },
];

interface Store {
  /** Capaciteit is gedeeld: een plek die één rijschool pakt, is weg voor alle anderen. */
  taken: Set<string>;
  /** Per rijschool (opleider) de eigen reserveringen, zoals het CBR die zou bijhouden. */
  byTenant: Map<string, Reservation[]>;
  /** Per rijschool de machtigingen die leerlingen "in Mijn CBR" hebben gegeven. */
  auths: Map<string, CbrAuthorization[]>;
  /** Machtigingen die door een reservering uit de lijst verdwenen (gedrag van TOP internet), per reservering. */
  consumed: Map<string, CbrAuthorization>;
}

// Overleeft hot-reload in dev; vervangt later de echte CBR-state.
const g = globalThis as unknown as { __cbrMock?: Store };
const store: Store = (g.__cbrMock ??= { taken: new Set(), byTenant: new Map(), auths: new Map(), consumed: new Map() });

const addDays = (n: number) => amsterdamDate(new Date(Date.now() + n * 86_400_000));

/** Voorbeeldleerlingen die "al gemachtigd hebben", zodat de demo niet leeg begint. */
function seed(): CbrAuthorization[] {
  return [
    { cbrRef: "K1001", name: "Sanne Bakker", birthDate: "2006-03-14", category: "B_PRAKTIJK", validUntil: addDays(300) },
    { cbrRef: "K1001", name: "Sanne Bakker", birthDate: "2006-03-14", category: "B_THEORIE", validUntil: addDays(300) },
    { cbrRef: "K1002", name: "Mohamed El Idrissi", birthDate: "2005-11-02", category: "B_PRAKTIJK", validUntil: addDays(180) },
    { cbrRef: "K1003", name: "Lotte Visser", birthDate: "2006-07-21", category: "B_PRAKTIJK", validUntil: addDays(20) },
    { cbrRef: "K1004", name: "Daan Smit", birthDate: "2007-01-30", category: "B_THEORIE", validUntil: addDays(330) },
  ];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const sameCandidate = (a: CbrAuthorization, c: CandidateIdentity) =>
  (!!a.cbrRef && !!c.cbrRef && a.cbrRef === c.cbrRef) ||
  (!!c.birthDate && a.birthDate === c.birthDate && norm(a.name) === norm(c.name));

function authsOf(tenantId: string): CbrAuthorization[] {
  let list = store.auths.get(tenantId);
  if (!list) store.auths.set(tenantId, (list = seed()));
  return list;
}

/* ---- Alleen voor de demopagina: wat een leerling in "Mijn CBR" doet ---- */
export const mockCbrAuthorizations = (tenantId: string) => [...authsOf(tenantId)];
export function mockAddAuthorization(tenantId: string, a: CbrAuthorization) {
  const list = authsOf(tenantId);
  const i = list.findIndex((x) => x.category === a.category && sameCandidate(x, a));
  if (i >= 0) list[i] = a; else list.push(a);
}
export function mockRemoveAuthorization(tenantId: string, category: string, name: string, birthDate: string) {
  store.auths.set(tenantId, authsOf(tenantId).filter((x) => !(x.category === category && norm(x.name) === norm(name) && x.birthDate === birthDate)));
}

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
  /** CBR_MOCK_AUTH_LIST=off simuleert een API die geen overzicht van machtigingen levert (terugvaloptie). */
  readonly supportsAuthorizationList = process.env.CBR_MOCK_AUTH_LIST !== "off";

  constructor(private readonly tenantId: string) {}

  private get mine(): Reservation[] {
    let list = store.byTenant.get(this.tenantId);
    if (!list) store.byTenant.set(this.tenantId, (list = []));
    return list;
  }

  async listAuthorizations() {
    if (!this.supportsAuthorizationList) throw new CbrError("UNSUPPORTED", "De API levert geen overzicht van machtigingen.");
    return [...authsOf(this.tenantId)];
  }

  async listLocations() {
    return LOCATIONS;
  }

  async findAvailability(q: AvailabilityQuery) {
    return generateSlots(q).slice(0, 60);
  }

  async reserve({ candidateId, candidate, slotId }: { candidateId: string; candidate: CandidateIdentity; slotId: string }) {
    const [product, locationId, startsAt] = slotId.split("|");
    // Het CBR controleert ZELF of er een geldige machtiging is, los van wat de rijschool denkt.
    const list = authsOf(this.tenantId);
    const category = categoryForProduct(product as Product);
    const auth = list.find((a) => a.category === category && sameCandidate(a, candidate));
    if (!auth || auth.validUntil < amsterdamDate(startsAt))
      throw new CbrError("NOT_AUTHORIZED", "Er is geen geldige machtiging van deze leerling voor deze rijschool.");
    if (store.taken.has(slotId))
      throw new CbrError("SLOT_TAKEN", "Deze plek is net door iemand anders gereserveerd.");
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
    this.mine.push(r);
    // Zoals in TOP internet: de leerling verdwijnt uit het machtigingenoverzicht zodra er een examen is aangevraagd.
    store.auths.set(this.tenantId, list.filter((a) => a !== auth));
    store.consumed.set(r.id, auth);
    return r;
  }

  async listReservations() {
    return [...this.mine].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async cancel(reservationId: string) {
    const r = this.mine.find((x) => x.id === reservationId);
    if (!r) throw new CbrError("NOT_FOUND", "Reservering niet gevonden.");
    r.status = "geannuleerd";
    // Conform CBR-regel 3: vrijgekomen plek komt later terug; in de mock direct.
    store.taken.delete(`${r.product}|${r.locationId}|${r.startsAt}`);
    // De machtiging staat daarna weer in het overzicht.
    const auth = store.consumed.get(reservationId);
    if (auth) {
      authsOf(this.tenantId).push(auth);
      store.consumed.delete(reservationId);
    }
    return r;
  }
}
