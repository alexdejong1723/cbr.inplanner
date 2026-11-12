# CBR Opleiders API: wat is bekend?

Bronnen (gelezen op 12 nov 2026):
- [Digitaal reserveringssysteem](https://www.cbr.nl/nl/voor-opleiders/nl/digitaal-reserveringssysteem)
- [Opleiders API](https://www.cbr.nl/nl/voor-opleiders/nl/digitaal-reserveringssysteem/opleiders-api)
- [Gebruikersvoorwaarden Opleiders API](https://www.cbr.nl/nl/voor-opleiders/nl/digitaal-reserveringssysteem/opleiders-api/gebruikersvoorwaarden)
- [Inloggen met eHerkenning](https://www.cbr.nl/nl/voor-opleiders/nl/digitaal-reserveringssysteem/inloggen-met-eherkenning)

> **Belangrijkste conclusie:** de CBR publiceert **geen endpoints, schema's of OpenAPI-spec**.
> Wat de API precies kan, is dus niet openbaar. Het CBR zegt alleen dat de API "dezelfde
> mogelijkheden gaat bieden als het Opleidersportaal op dat moment heeft". De technische
> documentatie staat in een *Developer Portal* waar je pas toegang toe krijgt na acceptatie.

## Wat het CBR wel zegt dat de API/portal kan

Op basis van het Opleidersportaal (opvolger van TOP internet):

| Mogelijkheid | Bron |
|---|---|
| Praktijkexamens reserveren | eHerkenning-pagina |
| Rekening-courant opwaarderen | eHerkenning-pagina |
| Examenresultaten bekijken | eHerkenning-pagina |
| Klant- en reserveringsgegevens delen met rijschoolsoftware | Opleiders API-pagina (WS API) |
| Reserveringen annuleren (onder voorwaarden) | Reserveringsregels |

Let op: dat de **API** al elk van deze functies bevat, staat nergens expliciet. Reken dus
op reserveren/annuleren/ophalen, maar verifieer dit in de Developer Portal.

## Planning

| Moment | Wat |
|---|---|
| t/m 31 maart 2027 | TOP internet blijft bruikbaar (gebruikersnaam + wachtwoord) |
| vanaf 1 april 2027 | B-producten alleen nog via het Opleidersportaal (eHerkenning verplicht) |
| later in 2027 | A- en BE-producten |
| 2028 | Beroepsproducten en code 95 |

De bestaande **WS API** (koppeling met TOP internet) blijft "voorlopig bestaan". Nieuwe
ontwikkeling hoort dus op de **Opleiders API** te gebeuren.

## Nieuwe reserveringsregels B-producten (vanaf 1 april 2027)

Geldt voor praktijkexamens, herexamens, theorie-examens en tussentijdse toetsen B:

1. Kandidaten kunnen onderling **niet meer ruilen of plekken verplaatsen** (uitzonderlijk: coulance).
2. **Annuleren** is kosteloos tot **28 dagen** voor het examen, óf binnen **48 uur** na aankoop.
3. Vrijgekomen plekken komen terug in het systeem en worden op **wisselende momenten** weer beschikbaar.

Gevolg voor de app: geen "verplaats"-knop, een duidelijke annuleerdeadline, en vrijgekomen
plekken verschijnen onvoorspelbaar (zie "Wachtlijst/alerts" in de roadmap).

## Wie mag de API gebruiken (belangrijk voor jouw plan)

De API is bedoeld voor een **Leverancier**: een bij de KvK ingeschreven rechtspersoon die
software aan rijscholen aanbiedt. Een rijschool die zelf software bouwt telt ook als
Leverancier. De rijschool zelf moet bij het CBR geregistreerd zijn.

- **Toegang aanvragen:** via klantenservice of het
  [contactformulier](https://www.cbr.nl/nl/service/nl/contact/contactformulier), met actuele KvK-gegevens.
- Het CBR kan een **beveiligingsscan** (online tool) uitvoeren en op basis daarvan weigeren.
- Je krijgt een **persoonlijke autorisatiesleutel** (niet overdraagbaar, niet delen).

## Technische en juridische eisen uit de gebruikersvoorwaarden

| Eis | Impact op ontwerp |
|---|---|
| Alleen vanaf **vooraf gedeelde IP-adressen**; geen generieke cloud-ranges, geen VPN | Vast uitgaand IP nodig (zie architectuur) |
| TLS-versies/ciphers volgens **NCSC** (goed/voldoende) | Moderne TLS-config, geen legacy clients |
| Authenticatiegegevens van de rijschool **alleen versleuteld opslaan** | Secrets in vault / encrypted-at-rest |
| Persoonsgegevens **niet buiten de EER** verwerken | EU-hosting, geen niet-EER-diensten (analytics, e-mail, logging!) |
| Alleen kandidaten met **machtiging** aan de rijschool; alleen noodzakelijke data | Machtigingsvlag per leerling; dataminimalisatie |
| Datalek melden aan **cert@cbr.nl binnen 48 uur** | Incidentproces |
| **Niet overbelasten**: synchroniseren op vaste intervallen of via triggers | Caching, rate limiting, geen polling-lussen |
| Beschikbaarheid niet gegarandeerd; **dagelijks 24:00-06:00 en zondag 24:00-13:00 niet beschikbaar** | UI moet dit netjes tonen, jobs plannen buiten die vensters |
| Sleutel 1 jaar niet gebruikt → CBR mag toegang beëindigen | Periodieke health-call |
| Wijzigingen bedrijfsgegevens binnen 5 werkdagen melden | Administratief |
| **Boete €10.000 per overtreding** zonder voorafgaande waarschuwing; aansprakelijkheid CBR max. €5.000 | Juridisch beoordelen voordat je live gaat |

## Wat we nog niet weten (vraag dit aan het CBR)

- Endpoints, datamodel, foutcodes, rate limits, OpenAPI-spec.
- Authenticatie: alleen API-sleutel, of ook OAuth/mTLS? Hoe werkt het "namens de rijschool" handelen
  (eHerkenning is voor mensen; hoe koppelt een rijschool zijn account aan een leverancier)?
- Is er een **testomgeving/sandbox** met fictieve data?
- Kunnen **beschikbare plekken** worden opgevraagd en op locatie/datum gefilterd, of alleen reserveren
  op een bekend aanbod? Is er een webhook/notificatie voor vrijgekomen plekken?
- Hoe wordt **betaling** afgehandeld (rekening-courant)? Kan de API saldo lezen/opwaarderen?
- Wordt een kandidaat via API-aanroep of via de machtiging in het portaal gekoppeld?
- Geldt het 28-dagen/48-uur-annuleerbeleid ook als API-validatie, of controleert de app dat zelf?
- Planning en beschikbaarheid van A/BE/beroeps/code 95 in de API.
