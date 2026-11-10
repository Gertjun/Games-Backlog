# Wishlist

Ideeën voor nieuwe functies en verbeteringen. Gebouwde punten verhuizen naar `CHANGELOG.md`.

## Snel te bouwen, direct merkbaar

1. ~~**"Wat ga ik nu spelen?"** — een knop die willekeurig een game uit de backlog kiest, eventueel binnen het huidige filter (bijvoorbeeld alleen SNES of alleen retro).~~ Gebouwd in 1.9.0.
2. **"Nu bezig" bovenaan** — de games met status *Bezig* als vaste strook bovenaan de lijst.
3. **Filters en sortering onthouden** — per apparaat bewaren, zodat ze na ontgrendelen niet opnieuw ingesteld hoeven te worden.
4. ~~**Slimmer toevoegen** — tijdens het typen van een titel Wikipedia-suggesties tonen en jaar, platform en serie automatisch invullen.~~ Gebouwd in 1.25.0.
5. **Vegen op de iPhone** — een rij naar links of rechts vegen om de status te wijzigen.

## Grotere functies

6. **Statistiekenscherm** (basis gebouwd in 1.24.0 als scherm Analyse; verloop van de backlog ontbreekt nog) — uitgespeeld per jaar en per platform, verhouding modern/retro, eigen sterren naast de Metascore en het verloop van de backlog.
7. **Jaaroverzicht** — "mijn gamejaar": wat er dat jaar is uitgespeeld, de hoogst beoordeelde game en de meest gespeelde console.
8. **Collectie bijhouden** — per game vastleggen of je hem bezit en hoe (fysiek of digitaal, los of compleet in doos), plus een status *Wensenlijst* voor games die je nog wilt kopen.
9. **Speeltijd** — velden voor gespeelde uren en geschatte lengte, met een filter voor korte games. HowLongToBeat heeft geen officiële API, dus waarschijnlijk zelf invullen.
10. **Opnieuw spelen** — meerdere playthroughs per game, elk met een eigen datum.
11. **Eigen tags** — bijvoorbeeld *co-op*, *100%*, *platinum trophy* of *met vrienden*, met filter.
12. ~~**Boxart-muur** — een weergave met alleen de hoesjes in een raster (vooral mooi op de iPad).~~ Gebouwd in 1.9.0.

## Onderhoud

13. **Dubbele games signaleren** — waarschuwing bij het toevoegen van een game met dezelfde titel en hetzelfde platform.
14. **Export naar CSV** — naast de versleutelde back-up, om de lijst in Excel of Numbers te openen.

## Bronnen

15. **Boxart via TheGamesDB** — hoesjes eerst van TheGamesDB halen, met Wikipedia als terugval, en in de details kunnen kiezen uit andere hoesjes (bijvoorbeeld een andere regio).
    - *Sleutel:* account op forums.thegamesdb.net, API-toegang aanvragen in het forum voor API-aanvragen, daarna de **Public API Key** ophalen op `api.thegamesdb.net/key.php`.
    - *Let op:* de API staat geen verzoeken rechtstreeks vanuit de browser toe (CORS, getest november 2026). Daarom is een gratis Cloudflare Worker als tussenschakel nodig, met de sleutel daar als geheime variabele. Het adres van de Worker komt in Instellingen en in de kluis (datamodelwijziging). Afbeeldingen van `cdn.thegamesdb.net` kunnen wel direct getoond worden (toevoegen aan `img-src` in de CSP).
    - *Alternatief:* ScreenScraper.fr heeft voor retro vaak betere media, maar vraagt naast je eigen account ook een ontwikkelaarsaccount (devid/devpassword).
