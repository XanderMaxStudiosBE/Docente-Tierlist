# Overdracht van de lokale Codex-chat

Momentopname: 7 oktober 2026. Dit bestand bevat de projectcontext; het is geen volledige export van de chat. Er staan geen wachtwoorden, tokens of privé-instellinks in.

## Product

Docente Ranking is een Nederlandstalige publieke website. Bezoekers ranken zeven docenten in S, A, B, C, D of F. E is op verzoek verwijderd. Rankings worden per browser en per klas ingestuurd; opnieuw insturen vervangt de vorige inzending voor die klas.

Resultaten tonen per docent de percentages per tier, gesorteerd op S-stemmen. Bezoekers zien de uitslag pas na een volledige eigen inzending. Er zijn een S-podium, matchscore zonder de eigen stem, een spreidingsscore, docentduels, Brusselse weekwinnaars, periodiek vernieuwde resultaten en PNG-export van de eigen tierlist.

## Klassen en docenten

Alle 19 klassen zijn beschikbaar: 1itf1, 1itf2, 1itf3, 1itf4, 1itf5, 1acs1, 1acs2, 2acs, 2appai, 2ccs, 2di, 3acs, 3app, 3ccs, 3di, wt, alumni, 1 graduaat en 2 graduaat.

`public/classes.js` definieert de labels, interne IDs en groepen. Bewaar de interne IDs `1ITF01`, `1ITF02`, `1ITF04` en `1ITF05`; de korte gebruikerslabels en oude links verwijzen naar dezelfde opgeslagen data. Standaard is 1itf4 geselecteerd.

Elke klas heeft eigen stemmen, duels, weekresultaten en docentnamen. Bij een nieuwe klas vult iemand eenmalig zeven unieke volledige namen in; die worden voor iedereen opgeslagen. De bestaande namen voor 1itf4 zijn Lena Dillien, Brent Pulmans, Michaël Cloots, Natalie Smets, Bart Portier, Stef Adriaansen en Stef Van Wolputte. In het algemene IT Factory-klassement worden dezelfde volledige docentnamen over klassen samengevoegd.

## Admin en foto's

`/admin` gebruikt e-mail en wachtwoord. Het eerste account wordt door de eigenaar zelf via een persoonlijke, eenmalige instellink aangemaakt. De productiesecret `ADMIN_SETUP_HASH` is al ingesteld bij Sites. Of de eigenaar het account ondertussen heeft aangemaakt, moet via de actuele adminstatus worden gecontroleerd. Deel of vernieuw de oude instellink niet uit dit document.

Admins kunnen een klas of alle klassen resetten. Dit begint een nieuwe stemronde; docentnamen en foto's blijven bestaan. Sessies zijn tijdelijk en server-side gecontroleerd.

Bezoekers kunnen JPG-, PNG- en WebP-foto's uploaden. De browser verkleint en hercodeert foto's; de server valideert bestandsgrootte en werkelijk formaat. R2 bewaart bestanden en D1 koppelt ze aan genormaliseerde docentnamen. De oorspronkelijke uploader kan vervangen; de server staat ook een ingelogde admin toe. Dezelfde docentnaam deelt een foto tussen klassen.

## Bestaande hosting

- Productie-URL: https://docente-ranking.maxdepoesgames.chatgpt.site/
- Exact Sites-project: `appgprj_6ac602e008ac81919727378fdaf822f1`.
- Audience: PUBLIC, uitdrukkelijk door de eigenaar gevraagd.
- Laatste gepubliceerde versie bij overdracht: 7.
- Gepubliceerde broncommit vóór de GitHub-overdracht: `ebbf8c0203c48dbe190b9f04369b19581389aa79`.
- Versie-ID: `appgprj_6ac602e008ac81919727378fdaf822f1~appgver_c94da83112d081918a8b8c2174164157`.
- Bindings: D1 `DB`, R2 `PHOTOS`. Bewaar die bestaande opslag.

GitHub is nu bedoeld als ontwikkelrepository voor Codex cloud. De bestaande Sites-hosting heeft een eigen bron- en publicatieprocedure. Blijf voor deploys dezelfde Site gebruiken en controleer de actuele gegevens met native Sites-tools.

## Domein bij Vimexx

De eigenaar heeft `docente-ranking-thomasmoregeel.eu` gekocht. Alleen het hoofddomein zonder `www` is aan Sites toegevoegd. Exact custom-domain-ID: `appgdom_6ac62d629bb08191869701b48a4157e7`.

De eigenaar heeft de twee A-records voor het hoofddomein ingesteld op `162.159.143.30` en `172.66.3.26`, het oude AAAA-record voor het hoofddomein verwijderd en de TXT-verificatierecords van Sites toegevoegd. De TXT-records zijn zichtbaar geworden. De eigenaar heeft daarna de TTL verlaagd; bevestig de actuele records bij een vervolgcontrole.

Laatste controle: provider_status `active`, maar Site-status `pending` en ssl_status `pending_validation`. De nameservers van Vimexx waren nog niet gelijk bijgewerkt. Vimexx toonde daarna de melding dat de wijziging binnen 2 tot 4 uur actief wordt. Dit is geen actuele garantie: vernieuw de domeinstatus via Sites voordat je een conclusie trekt. `www` staat nog op Vimexx en is niet gekoppeld.

## Volgende cloudchat

## Toegevoegde functies op 7 oktober 2026

Nieuwe bezoekers kiezen hun klas op het beginscherm. Alleen deze apparaatvoorkeur wordt in localStorage onthouden. Elke klas heeft een aparte favoriete-docentstem per browser en stemronde; de uitslag blijft blind totdat de tierlist is ingestuurd.

Schooljaar 2026-2027 bevat de bestaande data. Admins kunnen het volgende schooljaar starten; oude jaren blijven alleen leesbaar en hebben eigen namen en stemmen. `worker/features.js` namespaceert voor latere jaren de opgeslagen class_id met `YEAR:`, zonder de externe IDs te wijzigen. Ook voterhashes zijn per jaar gescheiden. Deze adapter is essentieel voor alle queries in de bestaande stem- en klastabellen.

Nieuwe docentfoto's gaan naar `photo_submissions`. Admins keuren goed of wijzen af; bestaande foto's blijven tot goedkeuring staan. Publieke fotoverzoeken moeten een huidige goedgekeurde foto hebben; pending foto's zijn alleen met een adminsessie zichtbaar.

Bezoekers kunnen een account aanmaken met e-mail en wachtwoord en eigen tierlistontwerpen server-side bewaren per klas en schooljaar. Accountcookies staan los van de anonieme stemcookie. Opslaan en laden brengen geen stem uit. Accounts hebben PBKDF2-wachtwoordhashes, tijdelijke server-side sessies en een inloglimiet. E-mailverificatie en wachtwoordherstel zijn nog niet toegevoegd.

Migratie 0006 voegt alleen nieuwe tabellen toe. De volledige testsuite bevat 16 tests.

De gebruiker wil de ontwikkeling en deze conversatie verderzetten via GitHub en Codex cloud. Lees deze overdracht, controleer de beschikbare Sites-verbinding en neem de gebruikersverzoeken mee. Controleer desgewenst eerst de voortgang van DNS en HTTPS. Maak geen nieuwe Site, verander geen hostingprovider en reset geen rankings zonder een nieuw verzoek.
