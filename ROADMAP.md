# Roadmap – wat moet of kan er nog gebeuren

> **Dit bestand (toekomst):** alles wat nog moet of kan gebeuren: functies, onderhoud, praktijktests en open punten. Het is de enige takenlijst.
> **Niet hier:** wat al gebouwd is → [`CHANGELOG.md`](CHANGELOG.md); waarom → [`DECISIONS.md`](DECISIONS.md); de stand van nu → [`README.md`](README.md); hoe het werkt → [`ARCHITECTUUR.md`](ARCHITECTUUR.md).

Bijgewerkt: 20 november 2026 · versie 1.34.4

Elk punt heeft een vast W-nummer dat nooit opnieuw wordt gebruikt (tot 20 november 2026 geschreven als #1, #2 …). Is een punt klaar, dan haal je het hier weg en zet je het nummer in de changelog bij de versie. Ideeën buiten de huidige taak komen hier ook, maar worden niet ongevraagd gebouwd. Volgende vrije nummer: W20.

## Eerst
- W16 **Changelog aanvullen voor 1.34.4** — PWA-Core v1.3.0 en de QR-koppeling via PAIR-2 (PR #5) staan nog niet in de changelog.
- W17 **QR-koppeling praktisch testen** — Na PR #5 een nieuw apparaat koppelen tussen laptop en iPhone.

## Snel te bouwen, direct merkbaar

- W2 **"Nu bezig" bovenaan** — de games met status *Bezig* als vaste strook bovenaan de lijst.
- W5 **Vegen op de iPhone** — een rij naar links of rechts vegen om de status te wijzigen.

## Grotere functies

- W6 **Statistiekenscherm** (basis gebouwd in 1.24.0 als scherm Analyse; verloop van de backlog ontbreekt nog) — uitgespeeld per jaar en per platform, verhouding modern/retro, eigen beoordeling naast de Metascore en het verloop van de backlog.
- W7 **Jaaroverzicht** — "mijn gamejaar": wat er dat jaar is uitgespeeld, de hoogst beoordeelde game en de meest gespeelde console.
- W8 **Collectie bijhouden** — per game vastleggen of je hem bezit en hoe (fysiek of digitaal, los of compleet in doos), plus een status *Wensenlijst* voor games die je nog wilt kopen.
- W9 **Speeltijd** — velden voor gespeelde uren en geschatte lengte, met een filter voor korte games. HowLongToBeat heeft geen officiële API, dus waarschijnlijk zelf invullen.
- W10 **Opnieuw spelen** — meerdere playthroughs per game, elk met een eigen datum.
- W11 **Eigen tags** — bijvoorbeeld *co-op*, *100%*, *platinum trophy* of *met vrienden*, met filter.

## Onderhoud

- W13 **Dubbele games signaleren** — waarschuwing bij het toevoegen van een game met dezelfde titel en hetzelfde platform.
- W14 **Export naar CSV** — naast de versleutelde back-up, om de lijst in Excel of Numbers te openen.
- W19 **Verouderde opmerking in `css/app.css`** — bovenin verwijst een opmerking nog naar de workflow "Nieuwe app instellen" en `tools/setup.mjs`, die er niet meer zijn. Meenemen bij de eerstvolgende versie die `css/app.css` wijzigt.

## Bronnen

- W15 **Boxart via TheGamesDB** — hoesjes eerst van TheGamesDB halen, met Wikipedia als terugval, en in de details kunnen kiezen uit andere hoesjes (bijvoorbeeld een andere regio).
    - *Sleutel:* account op forums.thegamesdb.net, API-toegang aanvragen in het forum voor API-aanvragen, daarna de **Public API Key** ophalen op `api.thegamesdb.net/key.php`.
    - *Let op:* de API staat geen verzoeken rechtstreeks vanuit de browser toe (CORS, getest november 2026). Daarom is een gratis Cloudflare Worker als tussenschakel nodig, met de sleutel daar als geheime variabele. Het adres van de Worker komt in Instellingen en in de kluis (datamodelwijziging). Afbeeldingen van `cdn.thegamesdb.net` kunnen wel direct getoond worden (toevoegen aan `img-src` in de CSP).
    - *Alternatief:* ScreenScraper.fr heeft voor retro vaak betere media, maar vraagt naast je eigen account ook een ontwikkelaarsaccount (devid/devpassword).
