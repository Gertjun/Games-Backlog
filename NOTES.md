# NOTES – Games Backlog

De **actuele stand**: versie, open punten en sessielog. Werk dit bij aan het eind van elke sessie (zie `CLAUDE.md`). Besluiten staan in `DECISIONS.md`, wensen in `WISHLIST.md`.

Laatst bijgewerkt: 17 november 2026 · versie **1.34.3**

---

## Stand (12 november 2026) – pilotmigratie PWA-Core v1.0.0
- Featurebranch `feature/pwa-core-v1.0.0-migration` vanaf Games Backlog `main`.
- Alle 13 allowlisted Core-bestanden overgenomen van de officiële tag `v1.0.0`; release-pin en manifestchecksum vastgelegd.
- `storagePrefix` (`games-backlog`), `defaultDataPath` (`games-backlog/vault.json`) en app-schema 9 ongewijzigd.
- Automatische opruiming van tombstones na 180 dagen verwijderd voor zowel `games` als `gameInfo`; de Core deletion ledger bewaart verwijderingen totdat actieve apparaten hebben bevestigd.
- Apparaatbeheer toegevoegd aan Instellingen → Synchronisatie.
- CI run #43290501399 geslaagd: 87 unit-/contracttests (inclusief legacy-passkeycompatibiliteit), 2 Playwright-tests (Chromium desktop en WebKit/iPhone 13), Core-pin 13/13 en precachecontrole met 13 Core-bestanden en 39 statische entries.
- Geen productie-datarepo, kluis, token of gebruikersgegevens benaderd. Geen handmatige iPhone-/twee-apparatentest uitgevoerd.

## Stand (17 november 2026) – migratie naar PWA-Core v1.2.2
- Featurebranch `chore/pwa-core-v1.2.2-migration` vanaf `main` commit `86f2fd75758e1731dbcd091fe37ccb099d57bcab`.
- Core-bestanden worden exact overgenomen van de officiële tag `v1.2.2`; manifest en release-pin verwijzen naar commit `14dc3ad12c56a448f7de47e2c4c39347475355f6`.
- App-versie verhoogd naar 1.34.3; opslagprefix `games-backlog`, datapad `games-backlog/vault.json` en schema 9 blijven ongewijzigd.
- Synthetische regressietest voor de deletion-ledger-revival wordt toegevoegd; CI en browserrooktests moeten nog draaien.
- Geen productie-datarepo, kluis, token of gebruikersgegevens benaderd.

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
