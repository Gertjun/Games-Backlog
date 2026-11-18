# NOTES – Games Backlog

De **actuele stand**: versie, open punten en sessielog. Werk dit bij aan het eind van elke sessie (zie `CLAUDE.md`). Besluiten staan in `DECISIONS.md`, wensen in `WISHLIST.md`.

Laatst bijgewerkt: 18 november 2026 · `main` 1.34.3 / PWA-Core v1.2.2; PR #5 stelt 1.34.4 / PWA-Core v1.3.0 voor

---

- **18 november 2026:** PR #5 bereidt PWA-Core v1.3.0 voor. De gedeelde PAIR-2-koppelcode draagt uitsluitend de GitHub Sync-configuratie over; het kluiswachtwoord blijft een afzonderlijke invoer. CI op de PR-branch is geslaagd; nog niet gemerged of praktisch getest.

## Stand (12 november 2026) – pilotmigratie PWA-Core v1.0.0
- Featurebranch `feature/pwa-core-v1.0.0-migration` vanaf Games Backlog `main`.
- Alle 13 allowlisted Core-bestanden overgenomen van de officiële tag `v1.0.0`; release-pin en manifestchecksum vastgelegd.
- `storagePrefix` (`games-backlog`), `defaultDataPath` (`games-backlog/vault.json`) en app-schema 9 ongewijzigd.
- Automatische opruiming van tombstones na 180 dagen verwijderd voor zowel `games` als `gameInfo`; de Core deletion ledger bewaart verwijderingen totdat actieve apparaten hebben bevestigd.
- Apparaatbeheer toegevoegd aan Instellingen → Synchronisatie.
- CI run #43290501399 geslaagd: 87 unit-/contracttests (inclusief legacy-passkeycompatibiliteit), 2 Playwright-tests (Chromium desktop en WebKit/iPhone 13), Core-pin 13/13 en precachecontrole met 13 Core-bestanden en 39 statische entries.
- Geen productie-datarepo, kluis, token of gebruikersgegevens benaderd. Geen handmatige iPhone-/twee-apparatentest uitgevoerd.

## Actuele stand – 18 november 2026

- Games Backlog staat op `main` met appversie **1.34.3** en de officiële PWA-Core **v1.2.2**.
- PR #2 is gemerged. De app pint exact tag `v1.2.2`, commit `14dc3ad12c56a448f7de47e2c4c39347475355f6` en manifest-SHA256 `702f8394d4ffd87072b33d6a1a6a3aa59b6124253334aef08772385037dc7616`.
- Opslagprefix `games-backlog`, datapad `games-backlog/vault.json` en schema 9 zijn behouden.
- De eerdere tekst dat CI en browserrooktests nog moesten draaien is achterhaald: de migratie-PR is gesloten en gemerged.
- Praktijktest op 18 november 2026: testspel aangemaakt op iPhone en na synchronisatie zichtbaar op laptop; titel op iPhone gewijzigd en na synchronisatie zichtbaar op laptop; testspel op laptop verwijderd en na synchronisatie verdwenen op beide apparaten. Dit bevestigt de app-specifieke create/update/delete-synchronisatie tussen iPhone en laptop voor deze test.
- De gedeelde PWA-Core-functionaliteit, waaronder offline herstel, is afzonderlijk praktisch getest en geaccepteerd via Vaste Lasten. Deze Core-tests zijn niet opnieuw volledig herhaald in Games Backlog.
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
