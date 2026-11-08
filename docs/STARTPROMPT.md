# Startprompt voor een nieuwe app

Gebruik dit als **eerste bericht** in een nieuw Claude-project, nadat je:
1. met *Use this template* de app-repo hebt gemaakt, en
2. `docs/CLAUDE-INSTRUCTIES.md` in de projectinstructies hebt geplakt.

Vul de velden tussen [ ] in. Weet je iets nog niet, laat het dan leeg; Claude vraagt ernaar.

---

```
We starten een nieuwe app op basis van mijn PWA-template. De projectinstructies gelden.

Repo: [eigenaar/reponaam]
Idee: [wat moet de app doen, voor wie, en welk probleem lost hij op, in een paar zinnen]
Must-haves voor de eerste versie: [lijstje]
Later of misschien: [lijstje]
Voorbeelden of inspiratie: [optioneel: een bestaande app, een Excel-lijst, een schermafbeelding]

Werk in deze volgorde. Na stap 3 stop je en wacht je op mijn akkoord.

1. Controle. Koppel de repo en controleer of de setup-workflow heeft gedraaid:
   - in js/config.js: de naam, een storagePrefix die niet 'mijn-app' is, het datapad, en versie 1.0.0 (ook in sw.js);
   - het manifest, de titels en de iconen.
   Controleer ook of GitHub Pages live is. Herstel wat je zelf kunt, en meld wat ik moet doen.

2. Vragen. Stel maximaal 5 gerichte vragen over wat nog onduidelijk is, zoals gegevens, berekeningen, schermen en randgevallen. Kies voor de rest zelf verstandige standaarden en zeg welke.

3. Voorstel:
   - het datamodel: collecties, velden en typen;
   - de schermen en de navigatie, mobiel eerst, met een korte schets per scherm in tekst;
   - wat in versie 1.0 komt en wat later;
   - externe API's (voor de CSP), privacy- of rekenrisico's, en de keuzes die je voor me hebt gemaakt;
   - een ingevuld blok "Over deze app", zodat ik het in de projectinstructies kan plakken.

4. Bouwen, na mijn akkoord:
   - vervang de demo in js/app.js en css/app.css (schema 1, en een merge voor elke collectie);
   - test lokaal volgens de instructies;
   - werk CHANGELOG.md bij voor 1.0.0 en push naar main.

5. Afronding. Vertel me:
   - hoe ik de app op mijn iPhone installeer, sync instel en Face ID aanzet;
   - wat ik daarna als eerste moet uitproberen;
   - welke 3 uitbreidingen logisch zijn als volgende stap.
```
