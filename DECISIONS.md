# DECISIONS – Games Backlog

Besluiten die een volgende sessie moet kennen. Oude besluiten pas je niet aan; een nieuw besluit vervangt een oud ("vervangt D3").

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
