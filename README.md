# Games Backlog

Installeerbare web-app (PWA) om bij te houden welke games Geert op welke console heeft gespeeld (PS5 en retro), op iPhone, iPad en laptop. Gegevens staan versleuteld op het apparaat en synchroniseren als één versleuteld bestand via de private repo `Gertjun/SyncData` (pad `games-backlog/vault.json`). Gebouwd op PWA-Core (`Gertjun/PWA-Core`); de map `js/core/` is die gedeelde kern.

## Waar vind je wat

Elk onderwerp staat op één plek (D13).

| | Vraag | Bestand |
| --- | --- | --- |
| Heden | Wat doet de app en waar staan we nu? | dit bestand, `README.md` (blok "Stand") |
| Heden | Hoe zit de app in elkaar (bestanden, datamodel, conventies, stijl)? | [`ARCHITECTUUR.md`](ARCHITECTUUR.md) |
| Toekomst | Wat moet of kan er nog gebeuren? | [`ROADMAP.md`](ROADMAP.md) |
| Verleden | Wat is er per versie veranderd? | [`CHANGELOG.md`](CHANGELOG.md) |
| Verleden | Waarom is iets zo gekozen? | [`DECISIONS.md`](DECISIONS.md) |
| Werkwijze | Hoe werkt Claude aan deze app (branches, testen, versies)? | [`CLAUDE.md`](CLAUDE.md) |

## Stand

Bijgewerkt: 20 november 2026 · `main` **1.34.4** met PWA-Core v1.3.0. Dit blok wordt aan het eind van elke sessie overschreven.

- PWA-Core v1.3.0 met QR-koppeling via PAIR-2 (PR #5) is gemerged; de koppelcode draagt alleen de GitHub Sync-instellingen over, het kluiswachtwoord vul je apart in. Nog niet praktisch getest (W17); de changelog mist 1.34.4 (W16).
- Opslagprefix `games-backlog`, datapad `games-backlog/vault.json` en app-schema 9 zijn sinds de overstap naar PWA-Core ongewijzigd.
- Praktijktest op 18 november (1.34.3): een testspel aanmaken, wijzigen en verwijderen synchroniseerde tussen iPhone en laptop. De gedeelde kern (onder meer offline herstel) is getest via Vaste Lasten, niet opnieuw hier.
- Hoesafbeeldingen via TheGamesDB wachten op een API-sleutel (W15).
- Documenten en werkwijze volgen sinds 20 november de uniforme opbouw (D13): nieuw `ARCHITECTUUR.md`, W-nummers in de roadmap, wijzigingen via pull request. De overblijfselen van de oude PWA-template (`docs/`, `tools/setup.mjs`) zijn weggehaald (W18). Voor de interface gelden de UI/UX-richtlijnen uit de projectkennis (D14); de bestaande schermen zijn er nog niet op nagelopen (W20).

## Synchronisatie instellen

1. De gegevens staan in de **private** data-repo `Gertjun/SyncData`, map `games-backlog/`.
2. Maak een **fine-grained personal access token**: GitHub → Settings → Developer settings → Fine-grained tokens.
   - *Repository access*: alleen de data-repo
   - *Permissions*: **Contents: Read and write** (de rest blijft *No access*)
   - Kies een vervaldatum en zet een herinnering om het token te vernieuwen.
3. In de app: Instellingen → Synchronisatie → eigenaar, repo en token invullen → *Opslaan en testen*.
4. Op een tweede apparaat kies je bij de eerste start **Bestaande koppelen**, of je koppelt via Instellingen → Synchronisatie → *Ander apparaat koppelen* (QR-code en pincode). Het kluiswachtwoord vul je apart in.

Er is **geen herstel** als je je wachtwoord vergeet. Bewaar het daarom in je wachtwoordmanager.
