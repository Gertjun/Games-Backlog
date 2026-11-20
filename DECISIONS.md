# DECISIONS – Games Backlog

Besluiten die een volgende sessie moet kennen. Oude besluiten pas je niet aan; een nieuw besluit vervangt een oud ("vervangt D3").

### D12 – PWA-Core is de centrale gedeelde kern (17 nov 2026)\n- **Besluit:** wijzigingen aan gedeelde kernfunctionaliteit worden eerst in `Gertjun/PWA-Core` ontwikkeld en als officiële, onveranderlijke release gepubliceerd. Apps pinnen een specifieke Core-release met commit en manifestchecksum; een upgrade gebeurt per app via een gecontroleerde PR. Geen automatische kopieeractie naar alle apps of de oude template.\n- **Waarom:** één controleerbare bron voorkomt dat gedeelde code tussen apps uiteenloopt en voorkomt onbedoelde verspreiding van app-specifieke wijzigingen.\n\n### D11 – Verwijderhistorie via PWA-Core deletion ledger (12 nov 2026)
- **Besluit:** `games` en `gameInfo` ruimen tombstones niet meer op basis van leeftijd op. De Core registreert verwijderingen in `__pwaSync` en verwijdert tombstones pas nadat alle actieve apparaten de verwijdering hebben bevestigd. De blijvende graveyard voorkomt dat oude back-ups of apparaten verwijderde records terugzetten.
- **Waarom:** een apparaat kan langer dan 180 dagen offline zijn; een tijdgebaseerde purge kan dan verwijderingen verliezen. App-schema 9 blijft ongewijzigd.

### D1 – Eén kaart per titel en platform (nov 2026)
- **Besluit:** games die op meerdere platforms of onder andere titels uitkwamen, krijgen elk een eigen kaart, met links naar de andere versies in de details en een aanduiding op het hoofdscherm.
- **Waarom:** een kaart met aliassen werd afgewezen.

### D2 – Vaste kaartgrootte (nov 2026)
- **Besluit:** elke kaart in het raster is even groot, met vaste regels voor wat er gebeurt als informatie niet past.

### D3 – Schermen via de zijbalk (nov 2026)
- **Besluit:** Overzicht, Analyse, Controle en Instellingen; het tandwiel is weg. Controle toont games met ontbrekende of onduidelijke info, ontbrekende delen van een serie, en kaarten met meerdere versies (met een splits-actie per game).

### D4 – Series als één geheel (nov 2026)
- **Besluit:** elke serie staat als één groep (bijv. alle Final Fantasy-games), niet gesplitst in Modern en Retro. Een console is geen serie; games zonder serie staan onder Overig. Uitgespeelde games staan altijd onderaan hun groep.

### D5 – Scores op dezelfde schaal (nov 2026)
- **Besluit:** eigen beoordeling op 1–100, net als Metacritic, met een handmatig veld voor een Metacritic-score die niet gevonden wordt.
- **Waarom:** zo zijn de twee vergelijkbaar.

### D6 – Statusfilter per apparaat (nov 2026)
- **Besluit:** op de iPhone chipknoppen (Alles, Backlog, Bezig …); op iPad en laptop een keuzelijst zoals de andere filters.

### D7 – Hoesafbeeldingen van TheGamesDB (nov 2026)
- **Besluit:** TheGamesDB als bron voor boxart.
- **Waarom:** ScreenScraper gebruikt Geert al op andere apparaten met een eigen login.

### D8 – Eerst Modern of Retro kiezen (nov 2026)
- **Besluit:** "Wat ga ik spelen" vraagt eerst Modern of Retro en kiest daarna binnen die categorie.

### D9 – Gedeelde kern van de PWA-template (10 nov 2026, template 1.3.0)
- **Besluit:** `js/core/` en `css/base.css` zijn gelijk aan de PWA-template (1.3.0) en aan de andere template-apps. Passkeys gebruiken een vaste PRF-invoer per app, zodat een bestaande passkey na opnieuw installeren weer werkt (*Bestaande passkey*). Face ID start vanzelf (`autoBiometricUnlock`), vergrendeltijd per apparaat.
- **Waarom:** Geert wil al zijn apps uniform. De MW4-aanpak voor passkeys is als standaard gekozen.

### D10 – Navigatie en Instellingen uit de kern (11 nov 2026, 1.34.0)
- **Besluit:** de app heeft geen eigen `nav.js` en instellingen-opmaak meer; schermen staan in `app.screens` en de schil tekent ze (template D6). De vier schermen uit D3 blijven.
- **Waarom:** Geert wil al zijn apps dezelfde indeling geven.

### D11 – Documenten naar verleden, heden en toekomst (20 nov 2026)
- **Besluit:** vier bestanden houden de app bij. Heden: `README.md`, met bovenaan een beschrijving van Games Backlog en een blok "Stand" (vervangt `NOTES.md`; geen sessielog meer). Toekomst: `ROADMAP.md`, de enige takenlijst; punten houden hun nummer en gebouwde punten verdwijnen eruit (vervangt `WISHLIST.md`). Verleden: `CHANGELOG.md` (wat) en `DECISIONS.md` (waarom). Een wijziging alleen aan deze documenten krijgt geen nieuwe appversie.
- **Waarom:** NOTES, WISHLIST en de changelog herhaalden elkaar en liepen uit de pas (NOTES noemde PR #5 nog als voorstel). Dezelfde indeling geldt voor al Geerts projecten.

