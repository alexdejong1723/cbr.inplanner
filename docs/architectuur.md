# Architectuur en opzet website

## Doel

Een webapplicatie waarmee rijschoolhouders examens voor hun leerlingen kunnen zoeken,
reserveren en annuleren via de CBR Opleiders API.

## Gebouwd in deze eerste opzet

- Next.js 14 (App Router) + TypeScript, server-rendered met Server Actions.
- Schermen: **Overzicht**, **Examen inplannen** (zoek op product/locatie/datum, reserveer voor een
  leerling), **Reserveringen** (met annuleerregels), **Leerlingen** (machtigingsstatus).
- `src/lib/cbr/` is de koppelingslaag:
  - `client.ts`: de `CbrClient`-interface, het enige contract dat de UI kent.
  - `mock.ts`: demo-implementatie zonder CBR-toegang (`CBR_MODE=mock`, standaard).
  - `real.ts`: lege plaatshouder voor de echte API (`CBR_MODE=cbr`).
  - `rules.ts` (+ tests): de CBR-reserveringsregels (28 dagen / 48 uur, geen verplaatsen).
- Server-side validatie van annuleren (`actions.ts`); de uitgeschakelde knop is alleen een hint.

## Wat bewust nog ontbreekt

| Onderdeel | Reden |
|---|---|
| Echte CBR-koppeling | Spec en sleutel zijn pas beschikbaar na acceptatie als Leverancier |
| Database | Mock-state zit in geheugen; leerlingen/gebruikers komen later in Postgres (EU) |
| Inloggen | Zie hieronder |
| Betaling/rekening-courant | Onbekend of de API dit ondersteunt |

## Kernbeslissingen

### 1. Wie is de "Leverancier"?
Alleen een KvK-ingeschreven rechtspersoon kan de API-sleutel krijgen, en de sleutel is
persoonlijk. Twee modellen:
- **Multi-tenant SaaS (aanbevolen als je dit aan meerdere rijscholen aanbiedt):** jij bent Leverancier, elke
  rijschool is een tenant. Eén sleutel, strikte tenant-scheiding in code en database.
- **Eigen installatie per rijschool:** de rijschool is zelf Leverancier. Eenvoudiger juridisch,
  maar meer beheer.

### 2. Vast uitgaand IP-adres
Het CBR accepteert alleen vooraf gedeelde IP's en **geen generieke cloud-ranges** (dus niet
"zomaar" Vercel/Netlify/Lambda). Aanpak: draai de CBR-aanroepen vanaf een EU-VPS/host met een
vast IP, of stuur uitgaand verkeer via een kleine egress-proxy met vast IP (`CBR_EGRESS_PROXY_URL`).
Het frontend-gedeelte mag elders draaien; alleen de CBR-client hoeft achter het vaste IP. Vraag het CBR
of jouw hostingprovider als "generieke cloud" geldt.

### 3. Authenticatie van gebruikers
Rijschoolhouders loggen in de app in; dat staat los van eHerkenning (dat is voor het CBR-portaal).
Start met e-mail + wachtwoord met verplichte 2FA (of een EU-IdP), met rollen per rijschool
(eigenaar, planner). Pas als bekend is hoe de API "namens de rijschool" werkt, bepaal je of
eHerkenning ook in jouw app nodig is.

### 4. Privacy (AVG) en EER
Persoonsgegevens blijven in de EER: EU-database, EU-e-mailprovider, geen niet-EER-analytics of
-foutmonitoring met persoonsgegevens. Verwerk alleen leerlingen met machtiging en alleen
noodzakelijke velden. Maak een verwerkersovereenkomst met rijscholen.

### 5. Betrouwbaarheid
- Cache zoekresultaten kort; geen agressieve polling (voorwaarde "niet overbelasten").
- Toon duidelijk wanneer de API dagelijks 24:00-06:00 / zondag tot 13:00 niet beschikbaar is.
- Voor reserveren: idempotente aanvraag en bij `SLOT_TAKEN` direct een alternatief tonen.
- Auditlog van alle reserveringen/annuleringen (wie, wanneer, welke leerling).

## Voorgestelde roadmap

1. **Nu:** toegang aanvragen (contactformulier + KvK-gegevens), vragen uit `api-overzicht.md` stellen.
2. **Fase 1 (mock):** UI verfijnen met een planner, kalenderweergave, leerlingenbeheer in een database.
3. **Fase 2:** accounts, rijscholen/tenants, rollen, auditlog, EU-hosting met vast IP.
4. **Fase 3 (na acceptatie):** `RealCbrClient` implementeren tegen de Developer Portal-spec,
   testen in sandbox, contracttests tegen de mock.
5. **Fase 4:** wachtlijst/alerts voor vrijgekomen plekken (regel 3), herinneringen naar leerling
   (EU-provider), meerdere instructeurs, daarna A/BE, beroeps en code 95 conform CBR-planning.

## Lokaal draaien

```bash
npm install
npm run dev      # http://localhost:3000, demomodus
npm test         # regels voor annuleren/verplaatsen
npm run typecheck
```
