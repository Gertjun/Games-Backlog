# NOTES – Games Backlog

De **actuele stand**: versie, open punten en sessielog. Werk dit bij aan het eind van elke sessie (zie `CLAUDE.md`). Besluiten staan in `DECISIONS.md`, wensen in `WISHLIST.md`.

Laatst bijgewerkt: 12 november 2026 · versie **1.34.2**

---

## Stand (12 november 2026) – pilotmigratie PWA-Core v1.0.0
- Featurebranch `feature/pwa-core-v1.0.0-migration` vanaf Games Backlog `main`.
- Alle 13 allowlisted Core-bestanden overgenomen van de officiële tag `v1.0.0`; release-pin en manifestchecksum vastgelegd.
- `storagePrefix` (`games-backlog`), `defaultDataPath` (`games-backlog/vault.json`) en app-schema 9 ongewijzigd.
- Automatische opruiming van tombstones na 180 dagen verwijderd voor zowel `games` als `gameInfo`; de Core deletion ledger bewaart verwijderingen totdat actieve apparaten hebben bevestigd.
- Apparaatbeheer toegevoegd aan Instellingen → Synchronisatie.
- Unit-, contract-, pin-, precache- en Playwright-tests en CI toegevoegd. Resultaten volgen na de eerste CI-run.
- Geen productie-datarepo, kluis, token of gebruikersgegevens benaderd. Geen handmatige iPhone-/twee-apparatentest uitgevoerd.

## 1. Werkwijze
Zie `CLAUDE.md`.

## 2. Stand
PWA om bij te houden welke games Geert op welke console heeft gespeeld (PS5 en retro), op iPhone, iPad en laptop. Gebouwd op de PWA-template.

## 3. Open punten en bekende problemen
- TheGamesDB-API-sleutel moet nog aangevraagd worden (hoesafbeeldingen).
- Zie `WISHLIST.md` voor geplande functies.

## 4. Sessielog (kort, nieuwste bovenaan)

- **12 nov 2026:**
  - 1.34.2: PWA-Core v1.0.0 gepind; apparaatbeheer en veilige verwijderadministratie geïntegreerd; automatische tombstone-purge verwijderd.
- **11 nov 2026:**
  - 1.34.1: kern gelijk aan template 1.4.2 (bredere zijbalk).
- **11 nov 2026:**
  - 1.34.0: navigatie en Instellingen komen nu uit de kern (template 1.4.1); `nav.js` en `settings-nav.js` zijn weg. Koppelcode toegevoegd.
- **10 nov 2026:**
  - 1.33.0: gedeelde kern gelijk aan template 1.3.0 (bestaande passkey, auto Face ID, vergrendeltijd per apparaat). NOTES en DECISIONS toegevoegd.
