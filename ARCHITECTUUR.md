# Architectuur – Games Backlog

> **Dit bestand (opbouw):** hoe de app in elkaar zit: bestanden, aansluiting op PWA-Core, datamodel, service worker, conventies en stijl.
> **Niet hier:** de stand van nu → [`README.md`](README.md); wat nog moet → [`ROADMAP.md`](ROADMAP.md); wat er per versie veranderde → [`CHANGELOG.md`](CHANGELOG.md); waarom → [`DECISIONS.md`](DECISIONS.md); werkafspraken → [`CLAUDE.md`](CLAUDE.md).

Alleen HTML, CSS en JavaScript-modules: geen framework, geen build-stap, geen npm-packages of CDN-scripts in de app. De tests gebruiken Node.js (`node --test`) en Playwright.

## Bestanden

```
index.html              Schil: setup-, vergrendel-, app- en instellingenscherm; strikte CSP
manifest.webmanifest    Naam, kleuren en iconen voor installatie
sw.js                   Service worker (offline + updates), VERSION per release
css/base.css            Basisstijl uit PWA-Core (niet aanpassen)
css/app.css             Stijl en kleuren van deze app
js/config.js            Naam, versie, opslag-prefix, datapad, timing
js/main.js              Opstarten
js/app.js               De app: datamodel, migratie, samenvoegen, scherm Overzicht, filters
js/seed.js              Startlijst voor een nieuwe kluis (uit Geerts notities)
js/corrections.js       Eenmalige correcties op de startlijst (schema 5)
js/platforms.js         Platformlabels: kleur en eigen icoontje per console
js/versions.js          Gekoppelde versies van dezelfde game (veld `links`, schema 4)
js/split.js             Eén kaart met meerdere platforms splitsen (vanuit Controle)
js/gameinfo.js          Informatie ophalen van Wikipedia en Wikidata
js/enrich.js            Scores en boxart op de achtergrond ophalen (collectie `gameInfo`)
js/suggest.js           Suggesties tijdens het typen bij "Game toevoegen"
js/series.js            Series indelen en een hele serie ophalen van Wikidata
js/series-dialog.js     Scherm "Hele serie toevoegen"
js/series-check.js      Controle → ontbrekende games uit je series
js/check.js             Scherm Controle: games met ontbrekende of onduidelijke info
js/analysis.js          Scherm Analyse
js/dropdown.js          Eigen uitklapmenu met aantallen per keuze
js/core/                Gedeelde kern PWA-Core (niet aanpassen, zie hieronder)
icons/                  App-iconen (icon-1024.png is de bron)
tests/                  Automatische tests: kerncontracten, migratie (unit/), browser (e2e/)
tools/pin.mjs           Controleert de PWA-Core-pin
tools/precache.mjs      Controleert dat alle kernbestanden in PRECACHE staan
core-manifest.json      Lijst en controlegetallen van de kernbestanden
pwa-core.lock.json      Vastgepinde PWA-Core-versie (tag, commit, SHA-256)
```

## Aansluiting op PWA-Core

- De kern (`Gertjun/PWA-Core`) regelt kluis, versleuteling, synchronisatie, vergrendeling, Face ID/passkey, koppelen (ook via QR), navigatie, Instellingen en back-up. De app pint een vaste release in `pwa-core.lock.json` (nu v1.3.0).
- **Bestanden in `core-manifest.json` pas je hier niet aan** (`js/core/*` en `css/base.css`). Een fix daarin hoort in PWA-Core; daarna komt hij via een aparte PR met een nieuwe pin naar deze app (D12). `node tools/pin.mjs verify` controleert dat de bestanden exact gelijk zijn aan de pin.
- De app levert één object `app` (in `js/app.js`) aan de schil (`js/core/shell.js`):
  - `screens`: Overzicht, Analyse en Controle (Instellingen voegt de kern zelf toe). De schil tekent de tabbalk onderin (iPhone), tabbladen onder de kopbalk (iPad rechtop) en de inklapbare zijbalk links (laptop, iPad liggend).
  - `schemaVersion`, `initialData()`, `migrate(data)`, `merge(local, remote)` en `render(root, ctx)`.
  - In `render` gebruik je `ctx.data` (alleen lezen), `await ctx.update(d => …)` om te wijzigen, en `ctx.toast()` / `ctx.confirm()`.
- **Waarin deze app afwijkt:**
  - Geen eigen koppel- of instellingenschermen: alles uit de kern (D10).
  - De app haalt zelf informatie op van Wikipedia en Wikidata (zie Externe diensten).
  - Een paar keuzes worden per apparaat bewaard, buiten de kluis (zie Per apparaat).

## Instellingen in `js/config.js`

| Instelling | Waarde | Let op |
| --- | --- | --- |
| `version` | MAJOR.MINOR.PATCH | Gelijk houden met `VERSION` in `sw.js` |
| `storagePrefix` | `games-backlog` | **Nooit wijzigen**: anders is de lokale kluis "weg" |
| `defaultDataPath` | `games-backlog/vault.json` | Pad van het kluisbestand in de private data-repo `Gertjun/SyncData` |
| `autoLockMinutes` | 5 | Per apparaat aan te passen |
| `autoBiometricUnlock` | aan | Face ID start vanzelf |
| `syncDelaySeconds` | 20 | Meerdere wijzigingen worden één commit |
| `minPasswordLength`, `kdfIterations` | 12, 600.000 | Wachtwoordbeveiliging |

## Datamodel

Alles staat in één versleutelde kluis. Gegevensversie: `SCHEMA = 9` in `js/app.js`.

```
{
  schema: 9,
  games: [{ id, createdAt, updatedAt, title,
            section: 'modern' | 'retro',
            group,                 // serie; games zonder serie: 'Overig'
            platforms: [tekst], years: [jaartal],
            status: 'backlog' | 'playing' | 'done' | 'dropped',
            rating,                // eigen beoordeling 1–100, 0 = geen
            myScore,               // handmatige Metascore 1–100, 0 = geen
            playedOn, finished ('jjjj-mm-dd'), notes,
            links?: [sleutel],     // gekoppelde versies (js/versions.js)
            confirmedPage?,        // op Controle bevestigde Wikipedia-pagina
            noAutoYear?, oneCard?  // zie hieronder
          }],
  gameInfo: [{ id (= game-id), createdAt, updatedAt, query, pinned, found, fetchedAt,
               pageid, title, qid, nlTitle, description, image, release, facts,
               metacritic: [{ score, platform }], gamerankings: [{ score, platform }] }]
}
```

- **Eén kaart per titel en platform** (D1). Versies van dezelfde game delen een sleutel in `links`.
- **`gameInfo`** is publieke informatie van Wikipedia/Wikidata, in een aparte collectie met hetzelfde id als de game. Zo kan het ophalen op de achtergrond nooit je eigen wijzigingen aan een game overschrijven.
- **Startlijst:** games uit `js/seed.js` hebben vaste id's (`seed-001` …) en `updatedAt: 1`, zodat ze nooit dubbel raken bij het samenvoegen.
- **Optionele velden zonder schemawijziging:** `noAutoYear: true` (jaar zelf weggehaald, niet automatisch aanvullen) en `oneCard: true` (op Controle bevestigd dat meerdere platforms op één kaart klopt). Oudere versies laten zulke velden gewoon staan.
- **Verwijderen** maakt een grafsteen (`removeById`, `deleted: true`), nooit echt weghalen. Bij een game gaat ook de bijbehorende `gameInfo` weg. PWA-Core houdt verwijderingen bij en ruimt grafstenen pas op als alle apparaten ze hebben bevestigd (D11, verwijderhistorie).
- **Samenvoegen:** `mergeCollections` uit de kern kiest per record de nieuwste wijziging, voor `games` en `gameInfo`.

### Geschiedenis van de gegevensversie

| Schema | Wat kwam erbij |
| --- | --- |
| 2 | `years`; jaar en platform tussen haakjes in de titel worden labels |
| 3 | Collectie `gameInfo` (Metascore in de lijst) |
| 4 | `links`: gecombineerde games uit de startlijst worden losse, gekoppelde games |
| 5 | Eenmalige correcties op de startlijst (`js/corrections.js`) |
| 6 | `myScore` en `confirmedPage` |
| 7 | Games in groep "PlayStation 5" gaan naar Overig (een console is geen serie) |
| 8 | Losse games uit Overig krijgen hun serie (`assignKnownSeries`) |
| 9 | Eigen beoordeling van 1–5 sterren naar 1–100 (× 20) |

### Gegevensversie verhogen

Alleen nodig als een oudere appversie de nieuwe gegevens niet goed kan samenvoegen of een nieuw veld zou kwijtraken. Een optioneel veld dat oudere versies gewoon laten staan, hoeft dat niet.

1. Verhoog `SCHEMA` in `js/app.js` en voeg een regel toe aan de tabel hierboven.
2. Breid `migrate(data)` uit met een stap `if ((data.schema || 0) < N)`. Een omzetting die op elk apparaat hetzelfde uitkomt, laat `updatedAt` ongemoeid.
3. Breid `merge(local, remote)` uit voor een nieuwe collectie.
4. Test dat gegevens van de vorige versie laden (`tests/unit/games-migration.test.js`). De kern toont "Update nodig" als de kluis een nieuwer schema heeft dan de app.

## Per apparaat (buiten de kluis)

In de `localStorage` van het apparaat, niet versleuteld en niet gesynchroniseerd, alleen weergavekeuzes:

- `games-backlog:view`: filters, weergave en sortering (het zoekveld begint altijd leeg);
- `games-backlog:collapsed`: ingeklapte groepen per weergave.

Zelfde prefix als de kluis, zodat *Dit apparaat wissen* ze ook wist. Persoonlijke gegevens horen hier nooit.

## Service worker en updates

- `sw.js` zet alle bestanden van `PRECACHE` in een cache per versie. **Nieuw bestand? Zet het in `PRECACHE`**, anders werkt het niet offline. `tests/precache.test.js` controleert dat alle genoemde bestanden bestaan; `tools/precache.mjs` dat alle kernbestanden erin staan.
- Geen automatische update: de app toont "Nieuwe versie beschikbaar → Bijwerken". Daarom moeten `version` in `js/config.js` en `VERSION` in `sw.js` altijd samen omhoog.
- Verzoeken naar andere domeinen (GitHub, Wikipedia, Wikidata) gaan altijd via het netwerk.

## Externe diensten en beveiliging

- **GitHub-API** (`https://api.github.com`) voor synchronisatie.
- **Wikipedia en Wikidata** (`en.wikipedia.org`, `nl.wikipedia.org`, `www.wikidata.org`) voor score, boxart, genre en series; afbeeldingen van `upload.wikimedia.org`. Gratis en zonder sleutel. Alleen de titel (en het jaar) of de zoekterm gaat erheen, nooit iets uit de kluis. Mislukt het (offline), dan stopt het ophalen en probeert de app het later opnieuw.
- Een nieuwe dienst: domein toevoegen aan `connect-src` (en voor afbeeldingen `img-src`) in de CSP in `index.html`, en offline en fouten netjes afvangen. Voor TheGamesDB is een tussenschakel nodig (W15).
- Strikte CSP: geen inline scripts, geen inline stijlen, geen event handlers in HTML.
- Gebruikersinvoer (titels, series, notities) en tekst van Wikipedia gaan via `h()` en `textContent`, nooit via `innerHTML`.
- Persoonlijke gegevens staan alleen in de versleutelde kluis. Geen gegevens, wachtwoorden of tokens loggen.

### Beveiligingsmodel (uit PWA-Core)

| Wat | Hoe |
| --- | --- |
| Gegevens | AES-256-GCM met een willekeurige datasleutel |
| Datasleutel | Ingepakt met PBKDF2-SHA256 (600.000 iteraties) van je wachtwoord, minimaal 12 tekens |
| Face ID / passkey | Via de PRF-extensie van WebAuthn, per apparaat ingesteld; een bestaande passkey werkt weer na opnieuw installeren (D9) |
| Op GitHub | Alleen het versleutelde bestand |
| GitHub-token | Versleuteld op het apparaat, wordt nooit gesynchroniseerd |
| Wachtwoord vergeten | Er is **geen herstel** |

## Bestanden aanbieden

Back-up en export lopen via `saveFile()` uit `js/core/dom.js`: op de iPhone het deelmenu (Bewaar in Bestanden, AirDrop), op de laptop een download. Nooit een eigen downloadlink maken. (Een export naar CSV staat op de roadmap, W14.)

## Stijl en indeling

Voor elk nieuw scherm, onderdeel of elke wijziging aan de interface gelden de regels in **`ui-ux-richtlijnen.md`** uit de projectkennis (tokens, raster, kleur en contrast, typografie, aanraakdoelen, staten, formulieren, lege en foutschermen, animatie, toegankelijkheid en de checklist vóór oplevering). Voor HTML gelden de regels in **`html-best-practices.md`**. Wijk je af, noteer dan de reden. Hoe de richtlijnen in deze app worden toegepast:

- **Tokens:** de app gebruikt zijn eigen kleurnamen (`--accent`, `--bg`, `--surface`, `--text`, `--muted`, `--border`), niet de namen uit de richtlijnen (`--color-primary`, `--color-bg` …). Gebruik de bestaande namen; hernoem ze niet ongevraagd. Een afstandsschaal (`--space-*`) is er nog niet (W20).
- Lettergroottes in `rem`.
- Bewegingen hebben een uitzondering voor `prefers-reduced-motion`.
- Kleuren alleen via de CSS-variabelen in `css/app.css` (`--accent`, `--bg`, `--surface`, `--text`, `--muted`, `--border`, `--brand-gradient` enz.), met een licht en een donker thema (`prefers-color-scheme`). Geen vaste kleuren in de rest van de CSS. Platformlabels krijgen hun kleur via `data-platform`.
- Huisstijl: blauw-violet verloop (`--brand-blue` → `--brand-violet`), accent `#5b5cf0`.
- Elke kaart in het raster is even groot (D2). Statusfilter: chips op de iPhone, keuzelijst op iPad en laptop (D6).
- Mobiel eerst: knoppen minimaal 44 px, invoervelden met 16 px tekst, rekening houden met safe areas (ook de iPad).
- Tabellen en grafieken (Analyse) passen op het scherm zonder schuifbalk opzij.
- Toegankelijkheid (WCAG 2.2 AA): iconknoppen met `aria-label`, formulieren met zichtbare labels, contrast gecontroleerd in licht én donker.

## Testen

```bash
npm install                      # eenmalig: testhulpmiddelen (Playwright)
npm run test:unit                # unit- en contracttests (node --test)
npm run test:e2e                 # browsertest op laptop- en iPhone-formaat (Playwright)
node tools/pin.mjs verify        # PWA-Core-pin klopt
node tools/precache.mjs          # kernbestanden staan in PRECACHE
python3 -m http.server 8080      # app lokaal openen op http://localhost:8080
```

Service workers en Web Crypto werken alleen via `https://` of `localhost`. GitHub Actions (`.github/workflows/test.yml`) draait dezelfde controles bij elke pull request naar `main`.
