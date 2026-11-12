# Architectuur en opzet website

## Doel

Een multi-tenant webapplicatie voor **eenmanszaken**: iedere rijschool krijgt een eigen, afgeschermde omgeving
waarin de rijschoolhouder (tevens enige opleider) leerlingen beheert en examens zoeken, reserveren en annuleren via de CBR Opleiders API.
Wij (de exploitant) zijn de **Leverancier** richting het CBR; de rijscholen zijn tenants.

## Multi-tenancy: hoe het werkt

- **Aanmelden met goedkeuring:** `/registreer` maakt een rijschool (tenant) met status `pending` plus een
  enige gebruiker. Er wordt **geen sessie** gestart. Zie "Aanmeld- en accountflow" hieronder.
- **Eén gebruiker per rijschool:** de app is bedoeld voor eenmanszaken, dus er zijn geen rollen, teamleden of
  uitnodigingen. Dit wordt ook door de database afgedwongen (unieke index op `users.tenant_id`). Tenant en gebruiker
  zijn bewust gescheiden tabellen gebleven; teamleden later toevoegen vraagt dan alleen een nieuwe migratie
  die die index weghaalt, plus een rollenmodel. De kolom `users.role` blijft bestaan (SQLite kan hem niet droppen
  door de CHECK-constraint) maar is altijd `eigenaar`.
- **Isolatie:** de tenant komt **altijd uit de server-side sessie**, nooit uit een formulier of URL.
  Alle database-toegang gaat via `src/lib/repo.ts`, waar elke functie een `tenantId` verplicht
  meekrijgt en elke query erop filtert. Een geraden id van een andere rijschool geeft dus "niet
  gevonden" (getest in `src/lib/repo.test.ts` en end-to-end met twee rijscholen).
- **CBR-client per tenant:** `getCbrClient(tenantId)`. De echte client gebruikt straks de CBR-gegevens
  van die rijschool. Capaciteit is in de mock bewust gedeeld: een plek die rijschool A pakt, is weg voor B.
- **Auditlog per tenant** (`/activiteit`): wie heeft wanneer welke reservering aangemaakt of geannuleerd.
- **Inloggen:** wachtwoorden met scrypt (min. 12 tekens), sessiecookie `httpOnly`/`sameSite=lax`/`secure` (productie),
  sessietoken alleen gehasht in de database, rem op wachtwoord raden (5 pogingen per 15 min).

## Aanmeld- en accountflow

```
registreren ──► tenant = pending, eigenaar niet bevestigd, geen sessie
     │
     ▼  mail met verificatielink (24 uur geldig, eenmalig)
e-mail bevestigen (klik op knop) ──► optioneel: melding aan ADMIN_NOTIFY_EMAIL
     │
     ▼
superadmin (/admin): goedkeuren  ──► tenant = approved, mail naar eigenaar ──► inloggen kan
                     afwijzen (met reden) ──► tenant = rejected, mail naar eigenaar
```

Statussen van een rijschool: `pending` → `approved` / `rejected`; `approved` ⇄ `suspended`;
`rejected` → `approved` (alsnog). Andere overgangen worden geweigerd (`setTenantStatus`).

- **Inloggen kan alleen** als het e-mailadres bevestigd is **én** de rijschool `approved` is.
  Dit wordt niet alleen bij het inloggen gecontroleerd maar bij *elke* request via de sessie, dus
  schorsen werkt direct. Bij schorsen/afwijzen worden bovendien alle sessies van die rijschool verwijderd.
- De reden van weigering (niet bevestigd / in afwachting / afgewezen / geschorst) wordt pas getoond
  **na een juist wachtwoord**, zodat niemand via de loginpagina kan nagaan welke accounts bestaan.
- **Goedkeuren kan pas als de eigenaar zijn e-mailadres heeft bevestigd.**
- **Verificatielink:** de GET-pagina toont alleen een knop; het token wordt pas bij de klik verbruikt, zodat
  virus-/mailscanners die links vooraf ophalen het niet opgebruiken.
- **Wachtwoord vergeten:** `/wachtwoord-vergeten` geeft **altijd dezelfde melding**, ongeacht of het adres bestaat.
  Resetlink: 1 uur geldig, eenmalig, alleen gehasht opgeslagen, een nieuwe aanvraag maakt de vorige ongeldig.
  Na een reset worden **alle sessies** van die gebruiker beëindigd. Max. 3 mails per uur per adres.
- **Superadmin:** aparte tabel, aparte login (`/admin/inloggen`), aparte cookie (`SameSite=Strict`, alleen onder
  `/admin`, 8 uur). Een superadmin kan dus niet via de gewone loginpagina inloggen en hoort bij geen enkele
  rijschool. Aanmaken via het script (hieronder). Tweestapsverificatie volgt later (ook voor superadmins).
- **E-mail:** `SMTP_URL` gezet → via SMTP (kies een provider **in de EER**). Zonder `SMTP_URL`: in ontwikkeling
  komen mails in de tabel `outbox` en de serverlog; in productie is dat een foutmelding, zodat er nooit
  stilletjes geen mail verstuurd wordt. Links in mails gebruiken `APP_URL` (nooit de Host-header).
- **Migraties:** `src/lib/db.ts` bevat genummerde migraties (`PRAGMA user_version`). Bestaande databases van vóór
  deze functie worden automatisch bijgewerkt en hun rijscholen blijven `approved`; nieuwe rijscholen starten
  altijd als `pending` (ook de kolom-default is `pending`). Migratie 3 (eenmanszaak) verwijdert bij bestaande
  databases extra gebruikers per rijschool (de oudste eigenaar blijft); hun reserveringen blijven bestaan en
  komen op de overblijvende gebruiker te staan, de auditlog blijft ongewijzigd.

## Schermen

Rijschool: Overzicht · Examen inplannen (product/locatie/datum, reserveren voor een gemachtigde leerling) ·
Reserveringen (met annuleerregels) · Leerlingen en machtigingen · Machtigingsmail · Activiteit · Instellingen (CBR-opleidernummer) · (alleen demo) Mijn CBR-simulatie.
Publiek: Aanmelden · Inloggen · E-mail bevestigen · Verificatiemail opnieuw · Wachtwoord vergeten/resetten.
Superadmin (`/admin`): rijscholen per status, goedkeuren, afwijzen met reden, schorsen, heractiveren.

## Machtigingen: reserveren alleen voor gemachtigde leerlingen

Een leerling machtigt de rijschool zelf bij het CBR (Mijn CBR met DigiD, of schriftelijk met ID-kopie), **per
categorie** (theorie en praktijk apart) en **1 jaar geldig**. Een e-mail van de leerling is geen machtiging en onze
app kan DigiD niet vervangen. De app doet daarom drie dingen: de machtigingen van het CBR overnemen, alleen
leerlingen met een geldige machtiging laten kiezen, en als het CBR geen overzicht levert een gecontroleerde terugval bieden.

```
CBR levert overzicht?  ja ──► machtigingen komen automatisch van het CBR (leidend)
                       nee ─► rijschool voert ze handmatig in ("niet geverifieerd"); het CBR controleert bij reserveren
```

- **Keuzelijst bij het inplannen:** per examenmoment alleen leerlingen met een *actieve* machtiging voor de categorie
  van het product (herexamen en tussentijdse toets vallen onder praktijk) waarvan de einddatum niet vóór het examen ligt.
  De server controleert dit opnieuw bij het reserveren (`reserveAction`); het CBR blijft leidend.
- **Model:** tabel `authorizations` (per leerling + categorie): `valid_until`, `source` (`cbr`|`handmatig`) en `status`
  (`actief`, `niet_meer_zichtbaar`, `geweigerd`, `ingetrokken`). Leerlingen hebben geboortedatum en optioneel
  CBR-kandidaatnummer (nodig om ze richting het CBR te herkennen).
- **Overzicht van het CBR (`CbrClient.supportsAuthorizationList`):** `src/lib/authorization-sync.ts` haalt het op
  en verwerkt het in één transactie. *Lazy*: bij openen van Plannen/Leerlingen alleen als het overzicht ouder is dan
  `AUTH_SYNC_TTL_MS` (5 min); de knop "Vernieuwen" en de sync na een reservering mogen vaker, maar nooit vaker dan
  `AUTH_SYNC_MIN_INTERVAL_MS` (15 s), i.v.m. de eis het reserveringssysteem niet te overbelasten. Bij een fout (bijv. 's nachts) blijft het laatst bekende
  overzicht staan. Handmatig ingevoerde machtigingen tellen dan niet meer mee, een handmatige die het CBR bevestigt wordt `cbr`.
- **Verdwijnen uit de lijst is niet hetzelfde als intrekken.** In TOP internet verdwijnt een leerling uit het
  machtigingenscherm zodra er een examen is aangevraagd en komt hij terug na een afgekeurd examen. Daarom wordt een
  verdwenen machtiging `niet_meer_zichtbaar` en toont de UI "Examen gereserveerd" (geen alarm) als er een lopende
  reservering is, anders een waarschuwing. Na annuleren verschijnt de leerling weer in de lijst. Dit gedrag is
  overgenomen uit een oude handleiding en **niet bevestigd** voor de nieuwe API; beide uitkomsten worden verwerkt.
- **Terugval (handmatig):** naam, geboortedatum, optioneel kandidaatnummer, categorie, einddatum en een bevestiging dat de
  machtiging gecontroleerd is. Wijst het CBR de reservering af (`NOT_AUTHORIZED`), dan wordt de machtiging `geweigerd` en
  krijgt de gebruiker een duidelijke melding; de rijschool kan hem opnieuw invoeren nadat de leerling alsnog machtigt.
- **Aannames om te controleren bij het CBR:** (1) een praktijkmachtiging dekt ook herexamen en tussentijdse toets;
  (2) de einddatum is de laatste geldige dag; (3) of de nieuwe API het overzicht levert en of leerlingen na een
  reservering uit dat overzicht verdwijnen.
- **Opleidernummer en uitlegmail:** een leerling vindt de rijschool in Mijn CBR met het CBR-opleidernummer. De rijschool
  legt dat vast op `/instellingen` (per rijschool, gewist of gewijzigd wordt in de auditlog bijgehouden; het formaat van het nummer is
  niet openbaar gedocumenteerd, dus we controleren alleen op 3 tot 20 letters/cijfers/spaties/streepjes). Op `/machtigingsmail` stelt de app
  een uitlegmail op voor de leerling (stappen uit Mijn CBR, DigiD-waarschuwing, 1 jaar geldig, einddatumregel, bij praktijk
  de papieren machtiging). De tekst staat in `src/lib/machtigingsmail.ts`; de stappen komen van de CBR-pagina "Opleider machtigen met DigiD"
  (stand november 2026) en moeten opnieuw worden gecontroleerd als het CBR zijn schermen wijzigt.
  **Bewust geen verzending door de app:** de tekst wordt in de browser opgesteld en de rijschoolhouder opent hem in het eigen
  mailprogramma (`mailto:`) of kopieert hem. Redenen: een mail die vraagt om met DigiD in te loggen komt vertrouwder over van de eigen
  afzender dan van een anoniem app-adres (phishingrisico), er worden geen e-mailadressen of namen van leerlingen opgeslagen of naar onze server
  gestuurd (dataminimalisatie, AVG), en de app kan niet als spamkanaal worden misbruikt. Het e-mailadres in de `mailto:`-link wordt alleen
  gebruikt als het een eenvoudig, veilig adres is. Willen we later toch zelf versturen, dan hebben we per leerling een e-mailadres,
  een vaste tekst, een limiet per rijschool en een duidelijke afzender nodig.
- **Het oude vinkje "gemachtigd" is vervangen** (migratie 4): het was een zelfverklaring zonder categorie of einddatum en
  wordt niet meegenomen; leerlingen en reserveringen blijven bestaan.
- **Demo:** zonder CBR-toegang speelt `/demo-cbr` (alleen in `CBR_MODE=mock`) na wat een leerling in Mijn CBR doet.
  `CBR_MOCK_AUTH_LIST=off` simuleert een API zonder overzicht, om de terugval te testen. De mock-CBR controleert bij
  reserveren zelf de machtiging, onafhankelijk van wat de rijschool invoert.

## Code-indeling

- `src/lib/cbr/`: koppeling met het CBR
  - `client.ts`: de `CbrClient`-interface, het enige contract dat de UI kent.
  - `mock.ts`: demo-implementatie (`CBR_MODE=mock`, standaard).
  - `real.ts`: lege plaatshouder voor de echte API (`CBR_MODE=cbr`).
  - `rules.ts` (+ tests): 28 dagen / 48 uur annuleren, geen verplaatsen/ruilen.
  - `authorizations.ts` (+ tests): wanneer een machtiging bruikbaar is, wie er te kiezen is, statusteksten.
- `src/lib/authorization-sync.ts`: overzicht van gemachtigde leerlingen ophalen en opslaan.
- `src/lib/repo.ts`: alle tenant-gescopede database-queries. `src/lib/db.ts`: schema.
- `src/lib/auth.ts`: sessies, `requireUser()`. `src/lib/password.ts`: scrypt. `src/lib/ratelimit.ts`: limiter.
- `src/lib/admin-auth.ts`: superadmin-sessies. `src/lib/mail.ts`: e-mail (SMTP/outbox) en mailteksten.
- `src/app/(app)/*`: pagina's voor rijscholen en publieke flows. `src/app/admin/*`: superadmin.
- `src/app/*-actions.ts`: server actions. `scripts/create-superadmin.ts`: eerste superadmin aanmaken.

## Wat bewust nog ontbreekt of tijdelijk is

| Onderdeel | Status / volgende stap |
|---|---|
| Echte CBR-koppeling | Wacht op acceptatie als Leverancier en Developer Portal-spec |
| Database | SQLite via `node:sqlite` (experimenteel in Node 22) voor het prototype. Productie: PostgreSQL in een EU-regio; alleen `db.ts`/`repo.ts` vervangen |
| Aanmelden | Gebouwd: goedkeuring door superadmin. Nog te doen: KvK-controle als hulpmiddel voor de beoordelaar |
| CBR-gegevens per rijschool | Hoe een rijschool zijn CBR-account aan ons koppelt is onbekend. Opslag **versleuteld** (verplicht volgens de voorwaarden), bijv. AES-256-GCM met sleutel uit een secret store |
| Tweestapsverificatie | Later (afgesproken); sterk aanbevolen voor eigenaren en superadmins |
| Rate limiting | Nu in-memory per proces (login, reset, verificatiemail); productie: gedeelde store (Redis/DB) |
| Mail via SMTP | Gebouwd met nodemailer en getest tegen een lokale SMTP-ontvanger; nog niet tegen een echte provider (SPF/DKIM/DMARC instellen) |
| Opruimen | Verlopen sessies/tokens worden nog niet periodiek verwijderd |
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
2. **Fase 1 (gedaan):** multi-tenant prototype met mock, aanmelden met goedkeuring, e-mailverificatie, wachtwoord vergeten, superadmin.
3. **Fase 2:** PostgreSQL (EU), 2FA, EU-hosting met vast IP, CBR-gegevens per tenant versleuteld.
4. **Fase 3 (na acceptatie):** `RealCbrClient` tegen de Developer Portal-spec, sandbox-tests, contracttests tegen de mock.
5. **Fase 4:** wachtlijst/alerts voor vrijgekomen plekken, kalenderweergave, herinneringen naar leerlingen (EU-provider), A/BE/beroeps/code 95 conform CBR-planning.

## Lokaal draaien

```bash
npm install
cp .env.example .env
ADMIN_PASSWORD='kies-een-lang-wachtwoord' npm run create-admin -- beheer@voorbeeld.nl "Naam"
npm run dev        # http://localhost:3000
npm test           # regels, isolatie tussen rijscholen, aanmeld- en tokenflow
npm run typecheck
```

1. Meld een rijschool aan op `/registreer`.
2. Zonder `SMTP_URL` staan de mails in de serverlog en in tabel `outbox`
   (`sqlite3 data/app.db "select to_addr, body from outbox"`); open daar de verificatielink.
3. Keur de rijschool goed op `/admin` (inloggen via `/admin/inloggen`), daarna kan de rijschool inloggen.

Gegevens staan in `./data/app.db` (niet in git). Verwijder die map om opnieuw te beginnen.
Vereist Node.js 22.13 of nieuwer (`node:sqlite`).
