# CBR Inplanner

Webapplicatie voor rijschoolhouders om CBR-examens in te plannen via de (nieuwe) CBR Opleiders API.

- [`docs/api-overzicht.md`](docs/api-overzicht.md): wat is bekend over de API, eisen, open vragen.
- [`docs/architectuur.md`](docs/architectuur.md): opzet van de website, keuzes en roadmap.

**Status:** werkend prototype in demomodus met een mock van het CBR. De echte koppeling
(`src/lib/cbr/real.ts`) wacht op toegang tot de CBR Developer Portal.

```bash
npm install
npm run dev
```
