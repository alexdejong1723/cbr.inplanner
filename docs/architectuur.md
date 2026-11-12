# Architectuur en opzet website

## Doel

Een multi-tenant webapplicatie: iedere rijschool krijgt een eigen, afgeschermde omgeving waarin
medewerkers leerlingen beheren en examens zoeken, reserveren en annuleren via de CBR Opleiders API.
Wij (de exploitant) zijn de **Leverancier** richting het CBR; de rijscholen zijn tenants.

## Multi-tenancy: hoe het werkt

- **Aanmelden:** `/registreer` maakt een rijschool (tenant) plus een eerste gebruiker met rol
  *eigenaar*. Inloggen via `/inloggen`.
- **Rollen:** *eigenaar* (beheert o.a. het team) en *planner* (leerlingen en reserveringen).
  Eigenaren voegen collega's toe op `/team`.
- **Isolatie:** de tenant komt **altijd uit de server-side sessie**, nooit uit een formulier of URL.
  Alle database-toegang gaat via `src/lib/repo.ts`, waar elke functie een `tenantId` verplicht
  meekrijgt en elke query erop filtert. Een geraden id van een andere rijschool geeft dus "niet
  gevonden" (getest in `src/lib/repo.test.ts` en end-to-end met twee rijscholen).
- **CBR-client per tenant:** `getCbrClient(tenantId)`. De echte client gebruikt straks de CBR-gegevens
  van die rijschool. Capaciteit is in de mock bewust gedeeld: een plek die rijschool A pakt, is weg voor B.
- **Auditlog per tenant** (`/activiteit`): wie heeft wanneer welke reservering aangemaakt of geannuleerd.
- **Inloggen:** wachtwoorden met scrypt, sessiecookie `httpOnly`/`sameSite=lax`/`secure` (productie),
  sessietoken alleen gehasht in de database, rem op wachtwoord raden (5 pogingen per 15 min).

## Schermen

Overzicht · Examen inplannen (product/locatie/datum, reserveren voor een gemachtigde leerling) ·
Reserveringen (met annuleerregels) · Leerlingen (toevoegen, machtiging) · Team · Activiteit.

## Code-indeling

- `src/lib/cbr/`: koppeling met het CBR
  - `client.ts`: de `CbrClient`-interface, het enige contract dat de UI kent.
  - `mock.ts`: demo-implementatie (`CBR_MODE=mock`, standaard).
  - `real.ts`: lege plaatshouder voor de echte API (`CBR_MODE=cbr`).
  - `rules.ts` (+ tests): 28 dagen / 48 uur annuleren, geen verplaatsen/ruilen.
- `src/lib/repo.ts`: alle tenant-gescopede database-queries. `src/lib/db.ts`: schema.
- `src/lib/auth.ts`: wachtwoorden, sessies, `requireUser()`.
- `src/app/*`: pagina's en server actions.

## Wat bewust nog ontbreekt of tijdelijk is

| Onderdeel | Status / volgende stap |
|---|---|
| Echte CBR-koppeling | Wacht op acceptatie als Leverancier en Developer Portal-spec |
| Database | SQLite via `node:sqlite` (experimenteel in Node 22) voor het prototype. Productie: PostgreSQL in een EU-regio; alleen `db.ts`/`repo.ts` vervangen |
| Zelf-registratie | Nu open voor iedereen. Productie: uitnodiging of goedkeuring, KvK-controle |
| CBR-gegevens per rijschool | Hoe een rijschool zijn CBR-account aan ons koppelt is onbekend. Opslag **versleuteld** (verplicht volgens de voorwaarden), bijv. AES-256-GCM met sleutel uit een secret store |
| Wachtwoord vergeten, e-mailverificatie, 2FA | Nog niet gebouwd; 2FA sterk aanbevolen voor eigenaren |
| Rate limiting login | Nu in-memory per proces; productie: gedeelde store (Redis/DB) |
| Tenant-routing | Nu via sessie. Optioneel later: subdomein per rijschool (`school.voorbeeld.nl`) |
| Row-level security | Extra vangnet in Postgres (RLS op `tenant_id`) naast de code-filtering |

## Kernbeslissingen

### Eén Leverancier-sleutel, veel tenants
De CBR-sleutel is persoonlijk en niet overdraagbaar of te delen "voor derden". Als SaaS-aanbieder
moet je het CBR expliciet vragen of één Leverancier-sleutel voor meerdere rijscholen is toegestaan
en hoe per rijschool wordt geautoriseerd. Dit is de belangrijkste juridische vraag voor deze opzet.

### Vast uitgaand IP-adres
Het CBR accepteert alleen vooraf gedeelde IP's, **geen generieke cloud-ranges**. Draai de
CBR-aanroepen vanaf een EU-host met vast IP, of via een egress-proxy (`CBR_EGRESS_PROXY_URL`).
Het frontend kan elders draaien. Vraag het CBR of jouw hostingprovider als "generieke cloud" geldt.

### Privacy (AVG) en EER
Alle persoonsgegevens blijven in de EER: EU-database, EU-e-mail, geen niet-EER-analytics of
-foutmonitoring met persoonsgegevens. Alleen leerlingen met machtiging en alleen noodzakelijke
velden (de app weigert reserveren voor niet-gemachtigde leerlingen). Verwerkersovereenkomst per
rijschool nodig, want jullie verwerken namens hen.

### Betrouwbaarheid
- Zoekresultaten kort cachen; geen agressieve polling (voorwaarde "niet overbelasten", ook gedeeld over alle tenants!).
- Toon wanneer het CBR niet beschikbaar is (dagelijks 24:00-06:00, zondag tot 13:00).
- Bij `SLOT_TAKEN` direct alternatieven tonen.

## Roadmap

1. **Nu:** toegang aanvragen bij het CBR en de open vragen uit `api-overzicht.md` stellen (zeker: meerdere rijscholen onder één Leverancier).
2. **Fase 1 (gedaan):** multi-tenant prototype met mock.
3. **Fase 2:** PostgreSQL (EU), uitnodigingsflow, wachtwoord vergeten, 2FA, EU-hosting met vast IP, CBR-gegevens per tenant versleuteld.
4. **Fase 3 (na acceptatie):** `RealCbrClient` tegen de Developer Portal-spec, sandbox-tests, contracttests tegen de mock.
5. **Fase 4:** wachtlijst/alerts voor vrijgekomen plekken, kalenderweergave, herinneringen naar leerlingen (EU-provider), A/BE/beroeps/code 95 conform CBR-planning.

## Lokaal draaien

```bash
npm install
npm run dev        # http://localhost:3000 → maak een rijschool aan via /registreer
npm test           # annuleerregels + isolatie tussen rijscholen
npm run typecheck
```

Gegevens staan in `./data/app.db` (niet in git). Verwijder die map om opnieuw te beginnen.
Vereist Node.js 22.13 of nieuwer (`node:sqlite`).
