# CLAUDE.md – werkafspraken voor Claude

Werkafspraken voor Games Backlog. Ze volgen de projectinstructies van het Claude-project "Games Backlog"; zeggen die iets anders dan dit bestand of `DECISIONS.md`, meld dat dan en vraag welke geldt.

## Aan het begin van een sessie
1. Lees het blok **Stand** in **`README.md`**, **`ARCHITECTUUR.md`** (opbouw, datamodel, conventies, stijl), **`ROADMAP.md`** (open punten) en **`DECISIONS.md`** (eerdere besluiten). Van **`CHANGELOG.md`** alleen de bovenste paar versies. Lees niet de oude chats.
2. Lees alleen de code die je voor de vraag nodig hebt. `js/core/` en `css/base.css` zijn PWA-Core: lees ze alleen als het nodig is.
3. Koppel de repository met schrijfrechten, haal `git fetch origin main` op en maak vanaf `main` een branch `claude/…`.

## Tijdens het werk
- **Taal en uitleg:** Nederlands, kort en zonder vakjargon. Alle teksten in de app zijn ook Nederlands. Moet Geert zelf iets doen, geef dan stap-voor-stap uitleg.
- **"Hoe zou je…" of "nog niet bouwen":** eerst uitleggen en wachten op akkoord.
- **Eerst vragen** als een wijziging bestaande gegevens raakt, het datamodel verandert, de gedeelde kern raakt of ingaat tegen een besluit in `DECISIONS.md`. Is iets onduidelijk, stel dan eerst een korte vraag.
- **Ideeën buiten de taak:** voorstellen en op `ROADMAP.md` zetten met een nieuw W-nummer, niet ongevraagd bouwen.
- **PWA-Core:** bestanden in `core-manifest.json` (`js/core/*`, `css/base.css`) pas je hier niet aan. Een fix daarin hoort in `Gertjun/PWA-Core`; meld het. Een nieuwe Core-release komt via een eigen PR met een nieuwe pin (D12).
- **Vaste regels** (datamodel, grafstenen, gegevensversie, service worker, CSP, beveiliging, stijl, toegankelijkheid, bestanden aanbieden): zie `ARCHITECTUUR.md`.
- **Nooit:** force-pushen, de geschiedenis herschrijven, branches verwijderen, of iets doen met de data-repository of tokens.

## Testen
- Altijd: `npm run test:unit`, `npm run test:e2e`, `node tools/pin.mjs verify` en `node tools/precache.mjs` (eenmalig `npm install`).
- Geen automatische test voor het onderdeel? Open de app in een headless browser op telefoon- en laptopformaat, in licht en donker. Controleer dat hij start, dat de console geen fouten toont en dat de wijziging werkt.
- Raakt de wijziging gegevens of synchronisatie, test dan ook: vergrendelen en ontgrendelen, synchroniseren tussen twee apparaten (ook een gelijktijdige wijziging), twee tabbladen tegelijk en gegevens van de vorige versie laden.
- Push nooit iets wat niet groen is. Wat niet getest kon worden (zoals Face ID of de echte iPhone), noem je expliciet.

## Van branch naar `main`
1. Push de branch, open een pull request en controleer dat de tests op GitHub groen zijn.
2. Meld in gewone taal wat er verandert en **wacht op akkoord**. Nooit mergen, een versie uitbrengen of publiceren zonder dat akkoord.
3. Na akkoord: breng de versie uit (zie hieronder) met **één commit per versie** en een korte Nederlandse boodschap die zegt wat er voor Geert verandert, bijvoorbeeld "Nu bezig bovenaan de lijst (1.35.0)". Merge daarna naar `main`.
4. Meld na het mergen wat er veranderd is, het nieuwe versienummer, nieuwe bestanden of mappen, en wat Geert op zijn telefoon kan controleren (bijvoorbeeld: "open de app, tik op 'Bijwerken' en kijk of …").
5. Gaat er na het mergen iets mis (ook rode tests op GitHub)? Meld het meteen, zet een `git revert` klaar als pull request en zoek daarna rustig de oorzaak.

Alleen documenten gewijzigd: geen nieuwe appversie, wel via een pull request.

## Een versie uitbrengen
- Versienummer `MAJOR.MINOR.PATCH`, zichtbaar in de app:
  - MAJOR als Geert iets moet doen (alle apparaten bijwerken, opnieuw koppelen);
  - MINOR voor een nieuwe functie;
  - PATCH voor een verbetering of foutoplossing.
- Verhoog `version` in `js/config.js` én `VERSION` in `sw.js` naar hetzelfde nummer.
- Werk **`CHANGELOG.md`** bij in gewone taal, met de W-nummers die erin zijn gebouwd. Haal die punten weg uit **`ROADMAP.md`**.

## Aan het eind van een sessie (altijd)
1. Overschrijf het blok **Stand** in **`README.md`** met de stand van nu (versie, wat is getest, bekende problemen). Geen sessielog: de geschiedenis staat in `CHANGELOG.md`.
2. **`ROADMAP.md`**: nieuwe taken en open vragen met een W-nummer erbij, klare punten eruit.
3. **`DECISIONS.md`**: een nieuw `D<n>`-besluit voor elke keuze die een volgende sessie moet kennen. Oude besluiten pas je niet aan; een nieuw besluit vervangt een oud ("vervangt D3").
4. **`ARCHITECTUUR.md`** bijwerken als de opbouw, het datamodel of een conventie is veranderd.
5. Zet deze wijzigingen in de pull request **én** in de projectkennis van het Claude-project (`claude/README.md`, `claude/ARCHITECTUUR.md`, `claude/ROADMAP.md`, `claude/DECISIONS.md`).
