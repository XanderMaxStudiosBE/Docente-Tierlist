# Overdracht van de lokale Codex-chat

Momentopname: 7 oktober 2026. Dit bestand bevat de projectcontext; het is geen volledige export van de chat. Er staan geen wachtwoorden, tokens of privé-instellinks in.

## Product

Docente Ranking is een Nederlandstalige publieke website. Bezoekers ranken de docenten van hun klas in S, A, B, C, D of F. E is op verzoek verwijderd. Rankings worden per browser en per klas ingestuurd; opnieuw insturen vervangt de vorige inzending voor die klas.

Resultaten tonen per docent de percentages per tier, gesorteerd op S-stemmen. Bezoekers zien de uitslag pas na een volledige eigen inzending. Er zijn een S-podium, matchscore zonder de eigen stem, een spreidingsscore, docentduels, Brusselse weekwinnaars, periodiek vernieuwde resultaten en PNG-export van de eigen tierlist.

## Klassen en docenten

Alle 19 klassen zijn beschikbaar: 1itf1, 1itf2, 1itf3, 1itf4, 1itf5, 1acs1, 1acs2, 2acs, 2appai, 2ccs, 2di, 3acs, 3app, 3ccs, 3di, wt, alumni, 1 graduaat en 2 graduaat.

`public/classes.js` definieert de labels, interne IDs en groepen. Bewaar de interne IDs `1ITF01`, `1ITF02`, `1ITF04` en `1ITF05`; de korte gebruikerslabels en oude links verwijzen naar dezelfde opgeslagen data. Standaard is 1itf4 geselecteerd.

Elke klas heeft eigen stemmen, duels, weekresultaten en docentnamen. Bij een nieuwe klas vult iemand eenmalig 1 tot 30 unieke volledige namen in; die worden voor iedereen opgeslagen. De bestaande namen voor 1itf4 zijn Lena Dillien, Brent Pulmans, Michaël Cloots, Natalie Smets, Bart Portier, Stef Adriaansen en Stef Van Wolputte. In het algemene IT Factory-klassement worden dezelfde volledige docentnamen over klassen samengevoegd.

## Admin

`/admin` gebruikt e-mail en wachtwoord. Het eerste account wordt door de eigenaar zelf via een persoonlijke, eenmalige instellink aangemaakt. De productiesecret `ADMIN_SETUP_HASH` is al ingesteld bij Sites. Of de eigenaar het account ondertussen heeft aangemaakt, moet via de actuele adminstatus worden gecontroleerd. Deel of vernieuw de oude instellink niet uit dit document.

Admins kunnen een klas of alle klassen resetten. Dit begint een nieuwe stemronde; docentnamen blijven bestaan. Sessies zijn tijdelijk en server-side gecontroleerd.

Docentfoto’s en uploads zijn verwijderd. Bestaande opslag wordt behouden, maar fotoroutes zijn gesloten.

## Bestaande hosting

- Productie-URL: https://docente-ranking.maxdepoesgames.chatgpt.site/
- Exact Sites-project: `appgprj_6ac602e008ac81919727378fdaf822f1`.
- Audience: PUBLIC, uitdrukkelijk door de eigenaar gevraagd.
- Laatste gepubliceerde versie vóór deze update: 8.
- Gepubliceerde broncommit vóór de GitHub-overdracht: `0a426e8b19baccb71592e1de360b131687918a68`.
- Versie-ID: `appgprj_6ac602e008ac81919727378fdaf822f1~appgver_83da5aeb6bd081918dc1471dab09047f`.
- Bindings: D1 `DB`, R2 `PHOTOS`. Bewaar die bestaande opslag.

GitHub is nu bedoeld als ontwikkelrepository voor Codex cloud. De bestaande Sites-hosting heeft een eigen bron- en publicatieprocedure. Blijf voor deploys dezelfde Site gebruiken en controleer de actuele gegevens met native Sites-tools.

## Domein bij Vimexx

De eigenaar heeft `docente-ranking-thomasmoregeel.eu` gekocht. Alleen het hoofddomein zonder `www` is aan Sites toegevoegd. Exact custom-domain-ID: `appgdom_6ac62d629bb08191869701b48a4157e7`.

De eigenaar heeft de twee A-records voor het hoofddomein ingesteld op `162.159.143.30` en `172.66.3.26`, het oude AAAA-record voor het hoofddomein verwijderd en de TXT-verificatierecords van Sites toegevoegd. De TXT-records zijn zichtbaar geworden. De eigenaar heeft daarna de TTL verlaagd; bevestig de actuele records bij een vervolgcontrole.

Controle op 7 oktober 2026 om 16:43 Belgische tijd: domeinstatus, provider_status en ssl_status zijn alle drie `active`. Het hoofddomein geeft via HTTPS een succesvolle HTTP 200 terug. `www` staat nog op Vimexx en is niet gekoppeld.

## Volgende cloudchat

## Toegevoegde functies op 7 oktober 2026

Nieuwe bezoekers kiezen hun klas op het beginscherm. Alleen deze apparaatvoorkeur wordt in localStorage onthouden. Elke klas heeft een aparte favoriete-docentstem per browser en stemronde; de uitslag blijft blind totdat de tierlist is ingestuurd. De keuze en publieksprijs staan uitsluitend in de activiteitstab Favoriete docent, direct naast Docentduels. Alle activiteitstabs ondersteunen pijltjestoetsen, Home en End.

De knop Delen rechtsboven is ook op het beginscherm beschikbaar. Hij opent een venster met Link kopiëren en, waar ondersteund, Via app delen voor het native deelmenu. Deel alleen de publieke hoofddomeinlink https://docente-ranking-thomasmoregeel.eu/, zonder account-, ranking- of URL-gegevens van de bezoeker.

Schooljaar 2026-2027 bevat de bestaande data. Admins kunnen het volgende schooljaar starten; oude jaren blijven alleen leesbaar en hebben eigen namen en stemmen. `worker/features.js` namespaceert voor latere jaren de opgeslagen class_id met `YEAR:`, zonder de externe IDs te wijzigen. Ook voterhashes zijn per jaar gescheiden. Deze adapter is essentieel voor alle queries in de bestaande stem- en klastabellen.


Bezoekers kunnen een account aanmaken met e-mail en wachtwoord en eigen tierlistontwerpen server-side bewaren per klas en schooljaar. Accountcookies staan los van de anonieme stemcookie. Opslaan en laden brengen geen stem uit. Accounts hebben PBKDF2-wachtwoordhashes, tijdelijke server-side sessies en een inloglimiet. E-mailverificatie en wachtwoordherstel zijn nog niet toegevoegd.

Migratie 0006 voegt alleen nieuwe tabellen toe. De volledige testsuite bevat inmiddels 19 tests.

De gebruiker wil de ontwikkeling en deze conversatie verderzetten via GitHub en Codex cloud. Lees deze overdracht, controleer de beschikbare Sites-verbinding en neem de gebruikersverzoeken mee. Controleer desgewenst eerst de voortgang van DNS en HTTPS. Maak geen nieuwe Site, verander geen hostingprovider en reset geen rankings zonder een nieuw verzoek.

## Feedback en automatische accountopslag

De Feedback-tab bevat suggesties, klachten en bugtickets over de website. Tickets vereisen een ingelogd memberaccount en zijn alleen toegankelijk voor de indiener en ingelogde admins. Admins lezen tickets van alle klassen en schooljaren, antwoorden en zetten de status op open, in behandeling of afgesloten. Gesprekken blijven behouden bij schooljaarwissels en rankingresets. Nieuwe migratie 0008 voegt uitsluitend support_tickets en ticket_messages toe. worker/tickets.js gebruikt de raw database omdat tickets appbreed zijn. Writes vereisen dezelfde origin; ticketcreatie en antwoorden hebben accountlimieten en revisions voorkomen dubbele replies bij conflicten. E-mail en account-id worden niet in ticketresponses meegestuurd.

De testsuite bevat nu 27 tests. Het favicon is de door de gebruiker aangeleverde afbeelding, als 64×64 PNG in public/favicon.png. De bouw en preview nemen dit als binary asset op; beide pagina's linken hetzelfde favicon en gebruiken dit ook als logo in de header.

Bij het insturen van een ranking door een ingelogde member slaat de server dezelfde tierlist en docentnamen atomair met de stemmen in het account op. De sleutel blijft account, schooljaar en klas; een gast kan gewoon anoniem stemmen. Alleen een ontwerp handmatig opslaan of laden brengt geen stem uit. Sinds 8 oktober 2026 wordt een lege, onaangepaste tierlist bij het openen/inloggen en klas- of jaarwissels automatisch uit het account teruggeladen. public/tierlist-restore.js wacht op account- en klasdata, controleert account, klas, jaar, ronde, docentnamen en bordrevision en negeert late antwoorden na edits of contextwissels. Laden blijft een GET en brengt geen stem uit; een ontbrekende of verouderde lijst toont een bericht. Bestaande browserinzendingen en lopende edits worden behouden.

## Tab Voor docenten

Binnen Feedback staan Algemene feedback en Voor docenten. De docenttab dient uitsluitend voor privé klachten over een eigen docentvermelding of ranking. Dezelfde memberaccount-login wordt gebruikt; dit verifieert niet of een indiener docent is en geeft geen extra toegang. Nieuwe tickets bevatten kind=teacher, category=complaint en de opgegeven teacherName. Algemene feedback blijft kind=general. Migratie 0009 voegt alleen kind (default general), teacher_name en een index toe; bestaande tickets en gesprekken blijven behouden. Admins kunnen op tickettype filteren. Eigenaarscontroles, statusafhandeling, rate limits en antwoorden blijven gelijk. De twee formuliertypes bewaren aparte tijdelijke invoer tijdens tabwissels; uitloggen wist die invoer en alle privéinhoud.

## Docentfoto’s verwijderd op verzoek

De docentfoto’s, uploads en goedkeuringswachtrij zijn uit de website en het adminpaneel verwijderd. Kaartjes gebruiken weer initialen. De oude foto- en uploadroutes geven 404; resultaten bevatten geen foto-URLs meer. Bestaande fototabellen, migraties en R2-binding blijven behouden zonder publiek toegankelijke bestanden. Herintroduceer de historische foto-instructies hierboven niet zonder nieuw verzoek.

## S-limiet en aparte duel-tab

Nieuwe rankings en bewaarde ontwerpen mogen maximaal één docent in S bevatten, ook via de API. Een nieuwe S-keuze stuurt de vorige docent terug naar Nog te ranken. Bij het laden van oude tierlists worden extra S-docenten alleen in het ontwerp teruggezet; historische stemmen blijven behouden. Bovenaan staan Tierlist en Docentduels als aparte tabbladen. De duels verschijnen uitsluitend in hun eigen paneel.
De Updates-knop toont de changelog. Een badge markeert een nieuwe release totdat die op dit apparaat is gelezen. Verhoog latestUpdate in public/app.js bij een volgende release en werk de changelog bij; deze leesvoorkeur staat alleen in localStorage.

## Instelbaar aantal docenten per klas

Klassen ondersteunen 1–30 unieke namen. Publieke setup blijft eenmalig. Admins gebruiken Docenten beheren om aantal en namen te wijzigen; een wijziging begint een nieuwe klasronde. Bestaande stemmen worden niet gewist. Accountontwerpen bewaren hun docentnamen; ontwerpen met een oudere lijst worden niet op andere docenten toegepast. Migratie 0007 verruimt ID-controles en voegt een optionele naam-snapshot toe. De 19 tests controleren ook migratiebehoud, aantallen 1/3/8/30 en adminwijzigingen met stale-round- en archiefbescherming.
