# PWA-template

Basis voor installeerbare Progressive Web Apps op GitHub Pages, met:

- **Versleutelde opslag** op het apparaat (AES-256-GCM, sleutel afgeleid van je wachtwoord met PBKDF2)
- **Synchronisatie** tussen apparaten via één versleuteld bestand in je eigen **private** GitHub-repo
- **Ontgrendelen met Face ID / Touch ID / Windows Hello / passkey** (WebAuthn PRF), met wachtwoord als terugval
- **Offline** werken en **updates** via een "Bijwerken"-knop (service worker)
- Automatisch vergrendelen, privacyscherm in de app-wisselaar, wachtwoord wijzigen, back-up en herstel, dark mode en iPhone-safe-areas
- Veilig bij **meerdere tabbladen** en bij **verschillende app-versies** op je apparaten
- Geen frameworks, geen build-stap en geen externe libraries: alleen HTML, CSS en JavaScript-modules

De meegeleverde demo, een lijstje met items, laat zien hoe alles samenwerkt. Voor een nieuwe app vervang je alleen `js/app.js` en `css/app.css` en pas je de configuratie aan.

---

## Structuur

```
index.html              Schil: setup-, vergrendel-, app- en instellingenscherm
manifest.webmanifest    Naam, kleuren en iconen voor installatie       ← per app
sw.js                   Service worker (offline + updates)             ← VERSION per release
css/base.css            Basisstijl van de template
css/app.css             Stijl van de app                               ← per app
js/config.js            Naam, versie, opslag-prefix, datapad, timing   ← per app
js/app.js               De app zelf: datamodel, merge, scherm          ← per app
js/main.js              Opstarten
js/core/                De template-kern (niet aanpassen per app)
  shell.js              Schermen, instellingen, sync, auto-lock, privacy, tabbladen, updates
  vault.js              Versleutelde kluis + lokale opslag (met opslagwachtrij)
  crypto.js             Web Crypto-functies
  biometric.js          Face ID / passkey (WebAuthn PRF)
  github.js             GitHub Contents API-client
  sync.js               Sync-logica (upload, download, samenvoegen, versiebewaking)
  records.js            Hulpfuncties voor records (id, updatedAt, verwijderen, opruimen)
  dom.js                h(), formatEuro(), parseEuro(), today(), saveFile()
icons/                  App-iconen (icon.svg is de bron)                ← per app
docs/CLAUDE-INSTRUCTIES.md   Instructies om in je Claude-project te plakken
docs/STARTPROMPT.md     Eerste bericht voor een nieuw app-project
CHANGELOG.md            Wijzigingen per versie
tools/setup.mjs         Stelt een nieuwe app in (naam, kleur, iconen)
.github/workflows/setup.yml  Draait setup.mjs automatisch na "Use this template"
```

## Eenmalig: de template-repo klaarzetten

1. Maak op GitHub een repo met de naam **`pwa-template`**. De automatische setup slaat een repo met precies deze naam over, zodat de template zelf nooit wordt omgebouwd.
2. Upload alle bestanden, **inclusief de verborgen map `.github`**. Op een Mac zie je die in Finder pas na ⌘ + Shift + . (punt).
3. Settings → vink **Template repository** aan.

## Nieuwe app starten

1. Ga naar de template-repo → **Use this template** → *Create a new repository*. Kies een reponaam zoals `vaste-lasten`; de app heet dan "Vaste Lasten".
2. **Wacht ongeveer een minuut.** De workflow *Nieuwe app instellen* (tabblad Actions) zet dan automatisch:
   - naam, korte naam, `storagePrefix` en datapad (afgeleid van de reponaam),
   - versie `1.0.0` in `config.js` en `sw.js`,
   - manifest, `<title>` en de iPhone-titel,
   - een lege `CHANGELOG.md`,
   - en probeert GitHub Pages aan te zetten.
3. **Eigen naam, kleur of icoonletter?** Ga naar Actions → *Nieuwe app instellen* → **Run workflow**, vul de velden in en vink *Opnieuw instellen* aan. De kleur en de iconen (alle formaten) worden dan ook gemaakt.
4. **GitHub Pages**: de samenvatting van de workflow laat zien of dit gelukt is. Zo niet, dan is het één klik: Settings → Pages → *Deploy from a branch* → `main` / `(root)` → Save.
5. **De app bouwen** doe je met Claude: maak een Claude-project, plak `docs/CLAUDE-INSTRUCTIES.md` in de instructies en vul de reponaam in. Claude werkt dan direct in de repo (`js/app.js` en `css/app.css`), test lokaal en pusht naar `main`. Begin het gesprek met de prompt uit `docs/STARTPROMPT.md`. Gebruikt de app een externe API, dan moet het domein in `connect-src` van de CSP in `index.html`; dat staat in de instructies voor Claude.
6. **Op je iPhone installeren**: open `https://<gebruiker>.github.io/<repo>/` in Safari → Deel → *Zet op beginscherm*.

> **Workflow faalt bij "Wijzigingen opslaan"?** Zet dan in de nieuwe repo Settings → Actions → General → *Workflow permissions* op **Read and write permissions** en start de workflow opnieuw via Run workflow.

> **Liever lokaal?** `npm install --no-save --prefix tools sharp@0.33.5` en daarna `APP_NAME="Mijn App" APP_COLOR="#0f766e" ICON_TEXT="M" node tools/setup.mjs`. Zie de uitleg bovenin `tools/setup.mjs`.

> **Waarom een unieke `storagePrefix`?** Al je apps op `<gebruiker>.github.io` delen dezelfde "origin" en daarmee dezelfde localStorage. Zonder unieke prefix overschrijven ze elkaars gegevens. De setup gebruikt daarom de reponaam. Wijzig de prefix niet meer zodra de app in gebruik is.

## Configuratie (`js/config.js`)

| Instelling | Standaard | Betekenis |
|---|---|---|
| `autoLockMinutes` | 5 | Vergrendelen na inactiviteit of op de achtergrond (0 = uit) |
| `syncDelaySeconds` | 20 | Wachttijd na de laatste wijziging voordat er gesynchroniseerd wordt. Zo worden meerdere wijzigingen één commit. Bij vergrendelen of het verlaten van de app gebeurt het direct. |
| `minPasswordLength` | 12 | Minimale lengte voor nieuwe wachtwoorden |
| `kdfIterations` | 600.000 | PBKDF2-iteraties |

## De app bouwen (`js/app.js`)

```js
export const app = {
  schemaVersion: 1,                                            // ophogen bij elke modelwijziging
  initialData()        { return { schema: 1, items: [] }; },  // nieuwe kluis
  migrate(data)        { /* oude schema's ombouwen + opruimen */ return data; },
  merge(local, remote) { /* twee versies samenvoegen */ },
  render(root, ctx)    { /* scherm opbouwen in root */ },
};
```

- `ctx.data` bevat de huidige gegevens (alleen lezen).
- `await ctx.update(d => { ... })` wijzigt de gegevens. Wijzigingen lopen één voor één, worden versleuteld opgeslagen, opnieuw getoond en daarna gesynchroniseerd.
- `ctx.toast(tekst, 'ok' | 'error')` en `ctx.confirm(vraag)`.
- Bouw elementen met `h('div', { class: 'card' }, ...)` uit `core/dom.js`. Tekst gaat daarbij altijd veilig via `textContent`.
- Lijsten met records beheer je met `core/records.js`: `newRecord`, `updateById`, `removeById` (maakt een "tombstone"), `alive`, `mergeCollections` en `purgeTombstones`. Zo werkt samenvoegen tussen apparaten vanzelf.
- Bedragen: `parseEuro('12,50')` → `1250` (centen) en `formatEuro(1250)` → `€ 12,50`.
- Bestanden aanbieden: `saveFile(naam, tekst, type)`. In de geïnstalleerde app op je telefoon gaat dat via het deelmenu, anders als download.

### Wat de schil voor je bewaakt

- **Meerdere tabbladen**: wijzigt een ander tabblad de kluis, dan laadt dit tabblad de nieuwe stand in.
- **Nieuwere gegevens dan de app**: heeft de data een hoger `schema` dan `app.schemaVersion` (er draait ergens al een nieuwere versie), dan toont de app "Update nodig". Bekijken kan dan nog, maar bewerken en synchroniseren staan stil tot je hebt bijgewerkt.
- **Privacy**: zodra de app naar de achtergrond gaat, wordt de inhoud afgedekt, zodat hij niet zichtbaar is in de app-wisselaar.
- **Opslag**: de app vraagt de browser om de opslag niet op te ruimen (`navigator.storage.persist()`).

## Synchronisatie instellen

1. Maak een **private** repo voor data, bijvoorbeeld `pwa-data`. Eén repo voor al je apps volstaat, met per app een eigen map.
2. Maak een **fine-grained personal access token**: GitHub → Settings → Developer settings → Fine-grained tokens.
   - *Repository access*: alleen je data-repo
   - *Permissions*: **Contents: Read and write** (de rest blijft *No access*)
   - Kies een vervaldatum en zet een herinnering om het token te vernieuwen.
3. In de app: Instellingen → Synchronisatie → eigenaar, repo en token invullen → *Opslaan en testen*.
4. Op een tweede apparaat kies je bij de eerste start **Bestaande koppelen** en vul je dezelfde gegevens en hetzelfde wachtwoord in.

## Beveiligingsmodel

| Wat | Hoe |
|---|---|
| Gegevens | AES-256-GCM met een willekeurige datasleutel |
| Datasleutel | Ingepakt met PBKDF2-SHA256 (600.000 iteraties) van je wachtwoord, minimaal 12 tekens |
| Face ID / passkey | De passkey levert via de PRF-extensie een geheim op, waaruit (via HKDF) een sleutel wordt afgeleid die de datasleutel inpakt. Dit wordt per apparaat ingesteld. |
| Op GitHub | Alleen het versleutelde bestand. GitHub en iedereen met toegang tot de repo zien geen inhoud. |
| GitHub-token | Versleuteld met de datasleutel op het apparaat en wordt nooit gesynchroniseerd |
| Vergrendelen | Openstaande wijzigingen worden eerst gesynchroniseerd, daarna wordt de sleutel uit het geheugen gewist |
| Wachtwoord vergeten | Er is **geen herstel**. Bewaar het in je wachtwoordmanager. |

Het kluisbestand staat op GitHub. Lekt het ooit, dan kan iemand offline wachtwoorden proberen. Een lange wachtzin van een paar losse woorden is daarom je belangrijkste bescherming.

Face ID via PRF werkt in Safari op iOS/macOS 18+ en in recente versies van Chrome en Edge. Waar het niet werkt, toont de app alleen het wachtwoord.

## Een nieuwe versie uitbrengen

1. Verhoog `version` in `js/config.js` **en** `VERSION` in `sw.js` naar hetzelfde nummer. Bij een verschil toont *Instellingen → Over* een waarschuwing.
2. Heb je een nieuw bestand toegevoegd? Zet het in `PRECACHE` in `sw.js`.
3. Heb je het datamodel gewijzigd? Verhoog `schemaVersion` en schrijf een migratie.
4. Noteer de wijziging in `CHANGELOG.md`.
5. Pushen. Geïnstalleerde apps tonen daarna "Nieuwe versie beschikbaar → Bijwerken".

## Lokaal testen

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Service workers en Web Crypto werken alleen via `https://` of `localhost`.

## Template-verbeteringen terugzetten

Pas je iets in `js/core/` aan dat voor al je apps nuttig is? Zet het dan ook terug in deze template-repo, en neem het daarna over in je andere apps door de map `js/core/` te kopiëren. Houd `core/` daarom vrij van app-specifieke code.
