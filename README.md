# CBR Inplanner

Multi-tenant webapplicatie waarmee elke rijschool in een eigen omgeving CBR-examens inplant via de (nieuwe) CBR Opleiders API.

- [`docs/api-overzicht.md`](docs/api-overzicht.md): wat is bekend over de API, eisen, open vragen.
- [`docs/architectuur.md`](docs/architectuur.md): opzet van de website, keuzes en roadmap.

**Status:** werkend prototype in demomodus met een mock van het CBR: aanmelden van rijscholen met goedkeuring door een superadmin, e-mailverificatie, wachtwoord vergeten, leerlingen, inplannen en annuleren, volledig gescheiden per rijschool. De echte koppeling
(`src/lib/cbr/real.ts`) wacht op toegang tot de CBR Developer Portal.

```bash
npm install
cp .env.example .env
ADMIN_PASSWORD='kies-een-lang-wachtwoord' npm run create-admin -- beheer@voorbeeld.nl "Naam"
npm run dev   # Node.js 22.13+. Rijschool aanmelden op /registreer, goedkeuren op /admin
```
