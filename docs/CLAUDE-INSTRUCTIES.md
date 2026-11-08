# Projectinstructies voor Claude

Kopieer alles onder de streep naar de **Instructies** van je Claude-project en vul het blok *Over deze app* in. Vul vooral de app-repo goed in. Codebestanden hoef je **niet** als projectkennis toe te voegen: Claude werkt direct in de repo en leest daar altijd de actuele versie.

---

## Over deze app (per project invullen)

- **Naam:** …
- **Doel:** … (welk probleem lost de app op, en voor wie)
- **Belangrijkste schermen:** …
- **Datamodel:** … (collecties en hun velden, bijvoorbeeld `items: { id, titel, bedragCenten, datum }`)
- **Externe API's:** geen / … (moeten in de CSP `connect-src` in `index.html`)
- **App-repo:** `…/…` (GitHub Pages: `https://….github.io/…/`)
- **Data-repo:** `…/…` (privé), pad `…/vault.json`. Hier komt Claude niet aan.
- **Huidige versie:** …

## Over mij en de werkwijze

- Communiceer in het Nederlands. Alle teksten in de app zijn ook Nederlands.
- Ik bouw deze apps voor mezelf en ben geen fulltime ontwikkelaar. Leg kort uit wat je wijzigt en waarom, in gewone taal.
- Vraag eerst als een wijziging bestaande gegevens raakt of het datamodel verandert.
- Houd het simpel: geen frameworks, geen build-stap, geen npm-packages en geen CDN-scripts. Alleen HTML, CSS en JavaScript-modules.

## Werken in de repo

- **Begin van elke sessie**: koppel de app-repo, haal de laatste versie op en lees `CHANGELOG.md`, `js/config.js` en `js/app.js`. Lees `README.md` en `js/core/` als je ze nodig hebt.
- **Wijzigingen gaan direct naar `main`.** Elke push staat binnen een paar minuten live op mijn telefoon. Daarom:
  1. Test eerst lokaal (zie *Testen*). Open de app in een browser en controleer dat hij start, dat er geen fouten in de console staan en dat de gewijzigde functie werkt. Push nooit iets wat je niet hebt gedraaid.
  2. Werk de versie en `CHANGELOG.md` bij (zie de vaste regels hieronder).
  3. Maak per afgeronde wijziging één commit, met een korte Nederlandse commitboodschap die zegt wat er voor mij verandert, bijvoorbeeld "Categorieën toevoegen aan uitgaven (1.3.0)".
  4. Push naar `main`.
- **Nooit**: force-pushen, de geschiedenis herschrijven, branches verwijderen, of iets doen met de data-repo of tokens.
- **Gaat er na een push iets mis?** Draai de commit terug met `git revert` en push dat, zodat de werkende versie meteen terug is. Zoek daarna rustig de oorzaak.
- **Twijfel je over een grote of riskante wijziging** (datamodel, `core/`, iets wat gegevens kan raken)? Leg eerst kort het plan voor en wacht op mijn akkoord voordat je pusht.
- **Na het pushen** meld je in gewone taal: wat er veranderd is, het nieuwe versienummer en wat ik op mijn telefoon kan controleren. Bijvoorbeeld: "open de app, tik op *Bijwerken* en kijk of …".

## Architectuur (gebaseerd op mijn PWA-template)

- Hosting op GitHub Pages. De app is een installeerbare PWA en wordt vooral gebruikt op iPhone (Safari, vanaf het beginscherm) en daarnaast op een laptop.
- `js/core/` is de template-kern: versleutelde kluis (AES-GCM + PBKDF2), Face ID/passkey-ontgrendeling (WebAuthn PRF), sync met één versleuteld bestand in een private GitHub-repo (Contents API), service worker, instellingen en auto-lock. **Pas `core/` niet aan** tenzij ik daar expliciet om vraag. Is een wijziging nodig, maak die dan generiek (bruikbaar voor al mijn apps) en meld het, zodat ik hem in de template kan terugzetten.
- App-specifieke code staat alleen in `js/app.js` (eventueel opgesplitst in extra modules onder `js/`), `css/app.css` en `js/config.js`.
- `app.js` exporteert `app` met `schemaVersion`, `initialData()`, `migrate(data)`, `merge(local, remote)` en `render(root, ctx)`. Gegevens wijzig je alleen via `await ctx.update(d => { … })`. Lees ze via `ctx.data` en muteer ze daar nooit direct.
- De schil regelt al: meerdere tabbladen, blokkeren als de data nieuwer is dan de app, het privacyscherm, sync-timing (`syncDelaySeconds`) en een minimale wachtwoordlengte. Bouw dat niet opnieuw in de app.

## Vaste regels bij elke wijziging

1. **Versie**: verhoog `version` in `js/config.js` en `VERSION` in `sw.js` naar hetzelfde nummer (semver: patch voor fixes, minor voor features).
2. **Nieuw bestand**: voeg het toe aan `PRECACHE` in `sw.js`.
3. **Externe API**: voeg het domein toe aan `connect-src` in de CSP in `index.html`, en vang offline of fouten netjes af.
4. **Datamodel gewijzigd**: verhoog `SCHEMA` (dat is ook `app.schemaVersion`) en schrijf een migratie in `app.migrate()`. Oude gegevens moeten blijven werken, ook als een ander apparaat nog op een oudere versie draait. Laat onbekende velden daarom staan.
5. **Records**: elk record in een lijst heeft `id`, `createdAt` en `updatedAt`. Gebruik de helpers uit `core/records.js` (`newRecord`, `updateById`, `removeById`, `alive`, `mergeCollections`). Verwijder records nooit echt uit een array, want tombstones zijn nodig voor de sync. Zorg dat `merge()` elke collectie samenvoegt.
6. **Veiligheid**: toon gebruikersdata altijd via `h()` of `textContent`, nooit via `innerHTML`. Sla geen gegevens op buiten de kluis (dus geen losse `localStorage`-sleutels met inhoud). Log geen gegevens of tokens naar de console.
7. **Notatie**: bedragen in centen als integers, invoeren met `parseEuro()` en tonen met `formatEuro()`. Datums als `yyyy-mm-dd` (gebruik `today()` voor de lokale datum) en tonen met `Intl` in `nl-NL`.
8. **Mobiel eerst**: touch targets van minimaal 44 px, inputs met 16 px tekst (anders zoomt iOS in), rekening houden met safe areas en dark mode. Gebruik de CSS-variabelen uit `base.css` (`--accent`, `--surface`, `--text`, `--muted`, `--border` …) in plaats van vaste kleuren.
9. **Toegankelijkheid**: knoppen met alleen een icoon krijgen een `aria-label`, en formulieren hebben labels.
10. **Bestanden aanbieden** (export, rapport): via `saveFile()` uit `core/dom.js`, nooit met een eigen download-link.
11. **CHANGELOG.md**: noteer elke versie met wat er is opgelost, toegevoegd of gewijzigd, in gewone taal.

## Testen (vóór elke push, voor zover relevant)

- Lokaal: `python3 -m http.server 8080` → `http://localhost:8080`. Test in een headless browser (bijvoorbeeld Playwright) op een iPhone-formaat scherm, in light en dark mode.
- Nieuwe kluis → items toevoegen → vergrendelen → ontgrendelen
- Sync tussen twee apparaten, inclusief een gelijktijdige wijziging op beide (handmatig via de sync-knop, of vergrendelen)
- Twee tabbladen tegelijk open: een wijziging in het ene verschijnt in het andere
- Bestaande gegevens van de vorige versie laden (migratie)
- Na de push: GitHub Pages is bijgewerkt en geïnstalleerde apps tonen "Nieuwe versie beschikbaar". Dat controleer ik zelf op mijn telefoon.
