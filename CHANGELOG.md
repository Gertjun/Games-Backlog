# Changelog

## 1.29.0

- **Meerdere platforms op één kaart splitsen.** Op Controle staat een nieuwe melding *Meerdere platforms*: games waarbij meer dan één platform op dezelfde kaart staat, zoals *Ocarina of Time* met N64, GC, Wii en 3DS (vaak zo toegevoegd via *Series controleren*) of *Link's Awakening/Link's Awakening DX*.
  - Tik op **Splitsen…** en je ziet per platform een voorstel met titel en jaar. Pas ze gerust aan. Bij een titel als "Titel A/Titel B" krijgt elke versie zijn eigen titel en jaar.
  - Staat een versie al als eigen kaart in je lijst (bijvoorbeeld *Ocarina of Time 3D* op de 3DS), dan stelt de app voor om die te **koppelen** in plaats van een dubbele kaart te maken.
  - Vink een platform uit als het niet op je lijst hoort, bijvoorbeeld een heruitgave. Het gaat dan alleen van de kaart af.
  - De eerste aangevinkte versie blijft de bestaande kaart, met je status, beoordeling, notities, score en boxart. De andere versies krijgen een eigen kaart met status Backlog in dezelfde serie, gekoppeld als *Andere versies*. Score en boxart worden daarna opgehaald.
  - Is het echt één game op meerdere platforms (bijvoorbeeld PS2 en Xbox)? Tik op **Klopt zo**, dan verdwijnt de melding voor die game.

## 1.28.1

- **Uitgespeelde games onderaan elke groep.** Bij *Per serie*, *Per platform* en *Per releasejaar* staan de games met status *Uitgespeeld* nu altijd onderaan hun groep. Wat je nog moet spelen zie je zo meteen bovenaan.
  - De gekozen sortering (bijvoorbeeld A–Z of Metascore) blijft gelden, apart voor het deel dat nog open staat en het deel dat is uitgespeeld.
  - Bij *Eén lijst* en de *Boxart-muur* verandert er niets.

## 1.28.0

- **Metascore (handmatig)** is de nieuwe naam van het veld *Eigen score*. Het doet hetzelfde: vond de app geen Metascore, of de verkeerde, dan vul je hem zelf in bij *Bewerken* of direct op Controle, en dan gebruikt de app die overal.
  - Op de kaart en in het detailscherm staat hij nu gewoon als **Metascore**. Een klein paars stipje rechtsboven laat zien dat je hem zelf hebt ingevuld (de paarse ring is weg).
  - In het detailscherm staat de score die de app zelf vond er klein onder, als *Gevonden op Wikipedia*.
- **Jouw beoordeling gaat van sterren naar 1–100**, dezelfde schaal als de Metascore. Je vult hem in bij *Bewerken*.
  - Je bestaande sterren zijn omgerekend: 1 ster = 20, 2 = 40, 3 = 60, 4 = 80, 5 = 100. Pas ze gerust aan nu je fijner kunt scoren.
  - Op de kaart zie je je beoordeling als ★ 85. In het detailscherm staat hij onder *Jouw voortgang*, met het verschil met de Metascore erbij (bijvoorbeeld *+7 t.o.v. Metascore 78*).
  - Op Analyse zie je je gemiddelde beoordeling en hoeveel je gemiddeld hoger of lager scoort dan de Metascore, over de games die allebei een score hebben.
- Gebruik je de app op meer apparaten, werk ze dan allemaal bij. Een apparaat met een oudere versie vraagt eerst om bij te werken voordat het synchroniseert.

## 1.27.0

- **Ontbrekende games in je series.** Op Controle staan bovenaan nu twee tabs: **Informatie** (wat er al was) en **Series**. Tik bij Series op *Series controleren* en de app kijkt bij elke serie in je lijst welke games er volgens Wikidata nog meer bij horen. Je hoeft de series niet zelf op te zoeken.
  - De app herkent de serie aan de games die je al hebt (hun Wikipedia-pagina weet bij welke serie ze horen). Lukt dat niet, dan zoekt hij op de naam van de serie; dat zie je dan onder de serie staan.
  - Of je een game al hebt, kijkt de app in je hele lijst. Een remaster, "HD" of "Definitive Edition" telt als dezelfde game, en "Mass Effect 1" als "Mass Effect".
  - Standaard zie je alleen games voor platforms die je al in je lijst hebt. Zet het vinkje uit om ook de rest te zien (bijvoorbeeld mobiele games).
  - Vink games aan, kies eventueel met de platformlabels welke platforms op de kaart komen, en tik op *Toevoegen*. Ze komen in die serie met status Backlog, en score en boxart worden daarna opgehaald.
  - Series die compleet zijn en series die Wikidata niet kent staan onderaan. Games onder Overig worden niet bekeken.
- Het resultaat blijft staan zolang de app open is; na vergrendelen is het weg en controleer je opnieuw.

## 1.26.0

- **Groepen inklappen.** Bij *Per serie*, *Per platform* en *Per releasejaar* tik je op de kop van een groep (bijvoorbeeld *Zelda* of *SNES*) om die in of uit te klappen. Het pijltje voor de naam laat zien of de groep open is; het aantal uitgespeeld blijft zichtbaar.
- Bovenaan de lijst staat **Alles inklappen** (of **Alles uitklappen** als alles al dicht is). Zo zie je eerst alleen de koppen en klap je open wat je wilt bekijken.
- Elke weergave onthoudt zijn eigen ingeklapte groepen zolang de app open is, net als de filters. Start de app opnieuw op, dan staat alles weer open.
- **Nieuwe weergave: Per releasejaar.** Je games gegroepeerd op het eerste jaar van release, oudste eerst. Games zonder jaar staan onderaan onder *Geen jaar*.

## 1.25.0

- **Slimmer toevoegen.** Typ bij *Game toevoegen* een paar letters van de titel en je ziet suggesties van Wikipedia, met hoesje en jaar. Staat de game al in je lijst, dan zie je dat er meteen bij.
- Tik op een suggestie en de app vult de titel, het jaar, het platform, de serie en de categorie (Modern of Retro) voor je in. Velden die je zelf al had ingetypt blijven staan.
- Is de game op meer platforms verschenen, dan zie je die als labels onder het veld Platforms. Tik erop om een platform toe te voegen of weg te halen.
- Boxart en score staan direct op de nieuwe kaart, van precies de pagina die je koos. Was het toch niet de goede, tik dan op *Ontkoppelen* of typ verder; dan zoekt de app later zelf.
- Werkt ook bij *Versie toevoegen*; daar blijft de serie van de oorspronkelijke game staan. Offline kun je gewoon zelf invullen zoals altijd.

## 1.24.0

- **Nieuw scherm: Analyse.** In de zijbalk (iPad liggend, laptop) en in de tabbalk onderin staat nu *Analyse*, tussen Overzicht en Controle. Je ziet er:
  - **Voortgang:** hoeveel games je hebt uitgespeeld, met een balk die de verdeling over Uitgespeeld, Bezig, Backlog en Gestopt laat zien.
  - **Uitgespeeld per jaar**, op de datum *Uitgespeeld op*.
  - **Per platform** en **per serie:** de hele balk is het aantal games, het gekleurde deel wat je daarvan hebt uitgespeeld. Bij series zie je eerst de tien grootste; met *Toon alle series* zie je ze allemaal.
  - **Modern en retro**, en **Scores:** de gemiddelde score, je eigen sterren en de vijf hoogst scorende games die nog in je backlog staan (tik erop voor de details).
  - Tik op een platform, serie, status of categorie en je gaat naar Overzicht met alleen dat filter aan.
- Het blokje met de voortgang bovenaan Overzicht is weg; die staat nu op Analyse.

## 1.23.3

- **Alle filterknoppen even groot.** Liggend (in de zijbalk) waren status, systeem en serie iets smaller dan de rest. Nu zijn ze allemaal even breed.
- Staand op de iPad staan alle menu's in drie gelijke kolommen: status, systeem en serie bovenaan, platform en jaar daaronder, en Weergave en Sorteren precies onder de filters. Rechts op de tweede en derde rij blijft een plek leeg.

## 1.23.2

- **iPad staand: filters netjes geordend.** De status is nu een uitklapmenu, net als in de zijbalk liggend en op de laptop. De losse statusknoppen (Alles, Backlog, Bezig …) staan alleen nog op de iPhone.
- De keuzes staan in groepen met een kop: onder **Filter** eerst status, systeem en serie, daaronder platform en jaar. Daaronder staan **Weergave** en **Sorteren** naast elkaar. De menu's zijn breed genoeg, dus de namen worden niet meer afgekapt ("Alle sy…").
- Op de iPhone (ook liggend), op de iPad liggend en op de laptop verandert er niets.

## 1.23.1

- **Hele serie toevoegen is duidelijker:** bij het zoeken zie je nu alleen nog echte series. Losse games, personages en "universe"-pagina's staan er niet meer tussen. Daardoor leek het eerste scherm al de keuzelijst, maar daar stonden nog geen platformlabels.
- Vindt de app precies één serie (zoals bij *Professor Layton*), dan ga je meteen door naar de lijst met games om aan te vinken, met de platformlabels erbij.
- Zijn er meer series (bijvoorbeeld bij *Mario*), dan tik je eerst de juiste serie aan. Met **Terug** kom je weer bij de zoekresultaten.

## 1.23.0

- **Nieuwe weergave: Per platform.** Kies bij Weergave voor *Per platform* en je ziet je games gegroepeerd per console, met het icoontje en de kleur van dat platform in de kop.
  - De platforms staan op volgorde van verschijnen: NES eerst, daarna onder andere SNES, PS1, GBA en NDS, tot PS5. Pc staat achteraan.
  - Staat een game op meer platforms, bijvoorbeeld NES en GBA, dan zie je hem onder elk van die platforms.
  - Games zonder platform staan onderaan onder *Geen platform*.
  - Net als bij *Per serie* zie je rechts per platform hoeveel games je hebt uitgespeeld. Filters en sorteren werken binnen elke groep.

## 1.22.0

- **Platformlabels bij Hele serie toevoegen:** in de lijst met games staan nu labels voor alle platforms waarop een game is verschenen, met dezelfde kleuren en icoontjes als op je kaarten. Het keuzemenu is weg.
  - Het oorspronkelijke platform staat aan (gekleurd). De andere platforms zijn omlijnd.
  - Tik op een label om dat platform op de kaart te zetten of weg te halen. Je kunt er ook meer dan één kiezen.

## 1.21.1

- **iPad: ruimte bovenin.** In de app op het beginscherm van de iPad schoof de kopbalk onder de statusbalk met de vervaging. Er is nu bovenin altijd minstens zoveel ruimte als de statusbalk hoog is, net als op de iPhone. Dat geldt staand en liggend, en ook voor het detailscherm van een game.
- Op de iPhone, op de laptop en in Safari zelf verandert er niets.

## 1.21.0

- **Zes nieuwe series:** games die bij elkaar horen staan niet meer los onder Overig, maar in hun eigen serie: *Mass Effect* (1, 2, 3), *Horizon* (Zero Dawn Remastered, Forbidden West), *The Last of Us* (Part 1, Part 2), *Star Wars Jedi* (Fallen Order, Survivor), *Mafia* (Definitive Edition, The Old Country) en *Chrono* (Trigger, Cross). Games waar je zelf al een serie had ingevuld, blijven zoals ze zijn.
- **Hele serie in één keer toevoegen:** tik op **+** en kies bovenaan **Hele serie toevoegen**. Zoek een serie, bijvoorbeeld *Professor Layton*, en je ziet alle games daaruit, oudste eerst.
  - Vink aan welke games je wilt. Games die al in je lijst staan, zijn niet aangevinkt.
  - Per game staat het oorspronkelijke platform voorgesteld. Heeft een game meer platforms, dan kies je er een uit het keuzemenu.
  - De naam van de serie kun je aanpassen. Heb je al een serie met dezelfde naam (zoals *Zelda* bij *The Legend of Zelda*), dan wordt die gebruikt.
  - Alle games komen in je Backlog, met het jaar erbij. Score en boxart worden daarna van de juiste Wikipedia-pagina opgehaald.
  - De lijst komt van Wikidata. Ontbreekt er een game, voeg die dan gewoon los toe met dezelfde serienaam.
- Een apparaat met een oudere versie vraagt eerst om bij te werken voordat je daar weer kunt bewerken.

## 1.20.0

- **Geen serie "PlayStation 5" meer:** PlayStation 5 is een console, geen serie. Die games staan nu onder **Overig**, samen met de andere losse games die niet bij een serie horen. Ze blijven wel Modern, dus met het filter Categorie → Modern zie je ze nog apart.
- **Overig staat altijd onderaan** in de weergave *Per serie*. De echte series staan erboven, in de volgorde van je lijst.
- Laat je bij Bewerken het veld *Serie / groep* leeg, dan komt de game ook onder Overig.
- Een apparaat met een oudere versie vraagt eerst om bij te werken voordat je daar weer kunt bewerken.

## 1.19.0

- **Eén kop per serie:** in de weergave *Per serie* staat elke serie nu maar één keer, ook als er moderne én retro games in zitten. *Final Fantasy* is dus één groep van deel I tot en met XVI, in de volgorde van je lijst. Voorheen stonden er twee groepen: "Modern · Final Fantasy" en "Retro · Final Fantasy".
- De koppen tonen alleen nog de naam van de serie, zonder "Modern ·" of "Retro ·" ervoor. Bovenaan staan de series met alleen moderne games (zoals PlayStation 5), daarna de rest in de volgorde van je lijst.
- Het filter **Categorie** (Modern of Retro) werkt nog zoals voorheen. Kies je Retro, dan zie je bij Final Fantasy alleen de oude delen.
- Je gegevens zijn niet veranderd.

## 1.18.0

- **Zelf de juiste Wikipedia-pagina kiezen:** onder "Niet de juiste game?" staat nu een veld waarin je een Wikipedia-link plakt (bijvoorbeeld van *Assassin's Creed Shadows*) of de titel typt. Een link of exacte titel wordt meteen gebruikt en vastgezet; met een andere zoekterm krijg je een nieuwe lijst om uit te kiezen. Links naar de Nederlandse Wikipedia werken ook.
- "Niet de juiste game?" toont nu tot 10 zoekresultaten in plaats van 5.

## 1.17.0

- **Laptop en iPad liggend:** de balk links is nu een volwaardige zijbalk. Bovenaan staat het app-icoon met de naam en het versienummer, daaronder de schermen Overzicht, Controle en Instellingen, elk met icoon en naam naast elkaar.
- De kopbalk bovenin toont daar nu de titel van het scherm waar je bent (Overzicht, Controle of Instellingen). De knoppen voor synchroniseren en vergrendelen staan nog rechtsboven.
- Op de iPhone en iPad staand verandert er niets.

## 1.16.0

- **Nieuwe indeling met drie schermen: Overzicht, Controle en Instellingen.** Op de laptop en iPad (liggend) kies je ze in een smalle balk links. Op de iPhone en iPad (staand) staan ze in een tabbalk onderin. Het tandwiel rechtsboven is weg.
- **Overzicht** is het vertrouwde scherm met al je games.
- **Controle** toont de games waarvan informatie mist of onduidelijk is:
  - **Geen score**: er is geen Metascore of GameRankings-score gevonden.
  - **Mogelijk andere versie**: de score en boxart komen van een Wikipedia-pagina met een andere titel, of met een releasejaar dat meer dan een jaar afwijkt. Bijvoorbeeld "Horizon Zero Dawn" (2017) bij de Remastered uit 2024.
  - **Geen jaar of platform** en **geen boxart**.
  - Het getal op de Controle-knop laat zien hoeveel games er op de lijst staan. Met de knoppen bovenaan kies je één soort probleem.
- Op Controle pas je alles direct aan. Je kunt een **eigen score** invullen, bijvoorbeeld die van Metacritic, en een jaar of platform. Met **Andere pagina kiezen** open je het detailscherm met de zoekresultaten. Met **Deze pagina klopt** bevestig je dat de gevonden pagina goed is. Een opgeloste game krijgt "Opgelost" en verdwijnt van de lijst als je het scherm verlaat.
- **Eigen score**: kun je ook invullen bij Bewerken. Die gaat voor de opgehaalde score. Op de kaart herken je hem aan een paarse ring. In het detailscherm staat de score van Wikipedia er klein onder. Sorteren op score gebruikt ook je eigen score.
- **Instellingen** is nu een eigen scherm in plaats van een los venster, met dezelfde onderdelen als voorheen.
- Een apparaat met een oudere versie vraagt eerst om bij te werken voordat je daar weer kunt bewerken.

## 1.15.0

Verbeteringen in de lijst, eenmalig doorgevoerd bij het openen van de app. Games die je zelf al had aangepast, blijven zoals ze zijn. Je status, sterren en notities blijven bij alle games staan.

- **Juiste game, jaar en score**: *Kingdom Come: Deliverance 2* (2025), *Last of Us Part 2* (2020), *Last of Us Part 1* (de PS5-remake, 2022), *Mass Effect 1, 2 en 3* (Legendary Edition, 2021) en *Pokémon Ruby/Sapphire/Emerald* (de originelen, 2002). Hun score en boxart worden opnieuw opgehaald van de juiste Wikipedia-pagina, en die pagina wordt vastgezet.
- **Alleen het jaar aangepast**: *Horizon Zero Dawn Remastered* (2024), *Death Stranding* (Director's Cut, 2021), *Skyrim* (Anniversary Edition, 2021) en *Castlevania - Order of Ecclesia* (2008). Deze versies hebben geen eigen Wikipedia-pagina, dus de score blijft die van het origineel.
- **Nieuwe of verbeterde titels**: *Hogwarts Legacy*, *Lego Harry Potter Collection* (2016), *Wo Long: Fallen Dynasty* (2023), *New Super Mario Bros. Wii*, *Assassin's Creed Shadows*, *The Callisto Protocol*, *Castlevania - Dawn of Sorrow*, *Castlevania II - Simon's Quest* en *Final Fantasy Crystal Chronicles*.
- *Oracle of Seasons* en *Oracle of Ages* hebben nu elk een eigen kaart.
- De Pokémon-games hebben nu een platform: GB, NDS, GBA of 3DS.
- *Final Fantasy XIV reboot*, *XV* en *XVI* staan nu bij **Modern · Final Fantasy**. Ze horen nog steeds bij de serie Final Fantasy.
- *Until Dawn 2* moet nog uitkomen. De app zoekt er daarom geen informatie meer voor, zodat er niet per ongeluk het jaar en de score van de eerste *Until Dawn* bij komen. Komt hij uit, kies dan in het detailscherm bij "Niet de juiste game?" de goede pagina.
- Een apparaat met een oudere versie vraagt eerst om bij te werken voordat je daar weer kunt bewerken.

## 1.14.1

- Op iPad en laptop zijn alle kaarten nu precies even hoog, zodat de rijen netjes uitlijnen. Er is altijd ruimte voor twee regels titel en één regel labels. Een korte titel staat in het midden van de kaart.
- Vaste afspraken als iets niet op de kaart past:
  - **Titel**: maximaal twee regels, daarna "…". De volledige titel zie je in het detailscherm (en op de laptop als je er met de muis op wijst).
  - **Labels**: altijd één regel. Status (Bezig, Gestopt), platform en jaar staan er altijd op.
  - **"ook op …"** wordt ingekort met "…" als de ruimte krap is; het schakelicoon blijft altijd zichtbaar.
  - **Sterren, datum en notities** verschijnen alleen als ze er helemaal op passen. Je ziet nooit een half label.
- Deze labelregels gelden ook in de lijst op de iPhone.

## 1.14.0

- Games die onder een andere titel op meerdere platforms zijn uitgekomen, krijgen nu per titel en platform een eigen kaart, met een eigen status. Zo staan bijvoorbeeld *Castlevania: Rondo of Blood* (PCE), *Castlevania - Dracula X* (SNES) en *Castlevania - The Dracula X Chronicles* (PSP) los in de lijst.
- De games uit je oorspronkelijke lijst die als "Titel A / Titel B" waren ingevoerd, zijn automatisch gesplitst (10 games worden er 21). Je status, beoordeling en notities gaan naar de versie waarvan het platform bij "Gespeeld op" staat, en anders naar de eerste versie. Games die je zelf met een "/" hebt toegevoegd, blijven zoals ze zijn.
- Op de kaart zie je met een paars labeltje met een schakelicoon dat er andere versies zijn, bijvoorbeeld "ook op PSP, SNES". Op de boxart-muur staat rechtsboven een paars rondje met hetzelfde icoon.
- In het detailscherm staat een nieuw blok **Andere versies**. Tik op een versie om daarheen te gaan. Met **Versie toevoegen** maak je een nieuwe, gekoppelde kaart. Met **Koppel bestaande game** koppel je een game die al in je lijst staat. Met **Loskoppelen** haal je de koppeling weg; de kaarten zelf blijven bestaan.
- Een apparaat met een oudere versie vraagt eerst om bij te werken voordat je daar weer kunt bewerken.

## 1.13.1

- Op iPad en laptop maakt een game met een lange titel de andere kaarten in dezelfde rij niet meer extra hoog. Elke kaart is nu zo hoog als hij zelf nodig heeft.
- Lange titels worden na twee regels afgekapt met "…". De volledige titel zie je in het detailscherm (en op de laptop ook als je er met de muis op wijst).

## 1.13.0

- Bovenaan staat nu het app-icoon naast de naam, en onder de naam zie je welke versie je gebruikt (bijvoorbeeld v1.13.0). Net als in Vaste Lasten. De kopbalk is even hoog gebleven.

## 1.12.0

- In de zijbalk (laptop, iPad liggend) is de status nu ook een uitklapmenu, net als de andere filters. De losse statusknoppen zijn daar weg.
- In alle filtermenu's (status, systeem, serie, platform en jaar) staat rechts naast elke keuze hoeveel games je dan ziet. Die aantallen houden rekening met de andere filters die al aan staan. Keuzes met 0 games zijn grijs.
- Het aantal bij de huidige keuze staat ook rechts in de knop zelf (op de iPhone alleen in het geopende menu, omdat de knoppen daar smal zijn).
- Weergave en Sorteren gebruiken hetzelfde menu, maar zonder aantallen: die zouden bij elke keuze gelijk zijn.
- Op de iPhone blijven de statusknoppen (Alles, Backlog, Bezig …) gewoon staan.

## 1.11.0

- De zijbalk op laptop en iPad (liggend) is overzichtelijker: de keuzes staan nu in groepen met een kop erboven. Onder **Filter** staan de statusknoppen (Alles, Backlog, Bezig, Uitgespeeld, Gestopt) en de keuzes voor systeem, serie, platform en jaar. Daaronder volgen **Weergave** (Per serie, Eén lijst, Boxart-muur) en **Sorteren**.
- Op de iPhone en de iPad staand is er niets veranderd: daar staan de keuzes nog compact naast elkaar, zonder koppen.

## 1.10.0

- De instellingen zijn op laptop en iPad (liggend) opnieuw ingedeeld. Je krijgt een groot venster met links de onderdelen (Synchronisatie, Beveiliging, Gegevens, Over de app en Dit apparaat), elk met een korte omschrijving. Rechts staat de inhoud van het gekozen onderdeel in losse kaarten naast elkaar, in plaats van één lange lijst om doorheen te scrollen.
- Achter elk onderdeel zie je in één oogopslag de stand van zaken: of synchronisatie gekoppeld is (met een groen, oranje of rood bolletje), of Face ID aan staat en welke versie je gebruikt.
- Bij Synchronisatie staat nu ook met welke repo en welk bestand dit apparaat gekoppeld is.
- Met de pijltjestoetsen omhoog en omlaag loop je door de onderdelen.
- Op de iPhone staan de instellingen nog steeds onder elkaar, nu wel netjes in kaarten gegroepeerd.

## 1.9.0

- Nieuw: de knop "Wat ga ik nu spelen?" kiest willekeurig een game uit je backlog. Staan er filters aan (bijvoorbeeld alleen SNES of alleen retro), dan kiest hij alleen daarbinnen. Je ziet de boxart, platforms, jaar en score, en je kunt meteen op "Ga ik spelen" tikken (de game wordt dan Bezig), de details bekijken of een andere suggestie vragen. Een game die je net voorgesteld kreeg, komt niet meteen weer terug.
- Nieuw: de weergave "Boxart-muur" (bij Weergave). Alle games als hoesjes in een raster, met linksboven een rondje voor Bezig, Uitgespeeld of Gestopt en rechtsonder de score. Tik op een hoesje voor het detailscherm. Zoeken, filters en sorteren werken gewoon. Heeft een game (nog) geen boxart, dan zie je een vlak in de kleur van het platform met de titel.

## 1.8.0

- De app is nu ook prettig te gebruiken op iPad en laptop. Op een breder scherm staan de games als losse kaarten in twee of drie kolommen, in plaats van één smalle lijst in het midden.
- Op een iPad in liggende stand en op een laptop staan de voortgang, het zoekveld, de statusknoppen en de filters in een vaste zijbalk links. Die blijft staan terwijl je door de lijst scrollt.
- Op de laptop licht een kaart op als je er met de muis overheen gaat.
- Op de iPhone is er niets veranderd.

## 1.7.0

- Nieuw: sorteren binnen de series. Met de nieuwe keuze "Weergave" kies je tussen "Per serie" en "Eén lijst"; de sortering (A–Z, Jaar van release, Metascore, Laatst gewijzigd, Beoordeling) werkt nu in beide. Per serie blijven de series op hun vaste plek staan en wordt alleen de volgorde van de games binnen elke serie aangepast.
- De vroegere sorteerkeuze "Per serie" heet nu "Lijstvolgorde": de volgorde waarin de games in je lijst staan.

## 1.6.0

- Nieuw: elke game krijgt nu een jaarlabel, ook de moderne games. Heeft een game nog geen jaar, dan neemt de app het eerste releasejaar over uit de informatie die al bij de scores en boxart is opgehaald (Wikipedia/Wikidata). Nieuwe games krijgen hun jaar vanzelf zodra die informatie binnen is.
- Een jaar dat je zelf hebt ingevuld blijft altijd staan. Haal je het jaar bij het bewerken weg, dan blijft het ook leeg en wordt het niet opnieuw aangevuld.
- Klopt een jaar niet (bijvoorbeeld het jaar van het origineel bij een remake)? Pas het aan via Bewerken.

## 1.5.0

- Nieuw: de Metascore staat nu als gekleurd blokje rechts in elke rij van de lijst (groen 75+, geel 50–74, rood daaronder). Heeft een oudere game geen Metascore, dan zie je de GameRankings-score als omlijnd blokje.
- Nieuw: sorteren op "Metascore", hoogste eerst; games zonder score staan onderaan.
- Scores, boxart en de basisgegevens van elke game worden één keer op de achtergrond opgehaald en in je kluis bewaard (in een aparte lijst, zodat dit je eigen wijzigingen nooit overschrijft). Bovenin zie je de voortgang. Nieuwe games en games met een aangepaste titel worden vanzelf opgehaald.
- Het detailscherm opent daardoor direct met boxart, score en details; alleen de samenvatting wordt nog even geladen.
- Kies je via "Niet de juiste game?" een andere pagina, dan wordt die keuze nu onthouden, ook op je andere apparaten.
- Let op: dit is een nieuwe versie van het datamodel. Werk de app op al je apparaten bij; een apparaat met een oudere versie kan pas weer bewerken na het bijwerken.

## 1.4.1

- Het detailscherm laadt sneller: de gegevens worden waar mogelijk tegelijk opgehaald, en het laden begint al zodra je een game aanraakt.
- Opgelost: de boxart werd soms maar half getoond. Hij verschijnt nu pas als hij helemaal geladen is, met tot die tijd een laad-animatie.

## 1.4.0

- Nieuw: tik op een game voor een detailscherm met de boxart, de Metascore (of de GameRankings-score bij oudere retro-games), genre, ontwikkelaar, uitgever, eerste releasedatum, spelmodi, serie, regie en muziek, plus een korte samenvatting (in het Nederlands als er een Nederlands Wikipedia-artikel is).
- Op het detailscherm zie je ook je eigen voortgang: tik op de status om hem te wijzigen, en je sterren, speeldatum en notities staan erbij. Bewerken gaat via de knop rechtsboven.
- De informatie komt gratis van Wikipedia en Wikidata. Alleen de titel (en het jaar) van de game wordt daarvoor opgezocht; er wordt niets uit je kluis meegestuurd of opgeslagen. Offline toont het scherm alleen je eigen gegevens.
- Klopt de gevonden game niet? Kies via "Niet de juiste game?" een ander resultaat.
- Opgelost: open schermen (bewerken, details) sluiten nu ook als de app vergrendelt.

## 1.3.0

- Platformlabels hebben nu elk een eigen kleur, gebaseerd op de kleur die bij de console hoort: bijvoorbeeld rood voor NES en Switch, paars voor SNES, groen voor Game Boy en blauw voor PlayStation.
- Elk platformlabel heeft een icoontje met de vorm van het apparaat: een controller voor thuisconsoles, een disc voor PlayStation, een rechtopstaande handheld voor Game Boy, een liggende voor GBA, PSP en Switch, twee schermen voor DS en 3DS en een monitor voor pc.
- Zelf toegevoegde platforms krijgen automatisch de accentkleur en een controller-icoontje.

## 1.2.0

- Nieuw: labels voor het jaar van release, naast de platformlabels. Filter op jaar en sorteer op "Jaar van release".
- Jaar en platform tussen haakjes in de titel, zoals "(1985, NES)", zijn eenmalig uit de titels gehaald en omgezet naar labels. Namen als "Super Famicom", "PlayStation" en "Nintendo DS" worden daarbij SNES, PS1 en NDS.
- Typ je bij een nieuwe of bewerkte game toch "(1991, SNES)" in de titel, dan wordt dat automatisch een jaar- en platformlabel.
- Bij het bewerken van een game staat een nieuw veld "Jaar van release". Een game kan meerdere jaren hebben (bijvoorbeeld origineel en remake).

## 1.1.0

- Nieuw app-icoon (de controller op blauw-violet), ook op het beginscherm van iPhone en iPad.
- Nieuwe stijl op basis van het icoon: diep nachtblauw in de donkere modus, een lichte lavendeltint in de lichte modus en een blauw-naar-violet verloop op knoppen, filters, de voortgangsbalk en de appnaam.

## 1.0.0

- Eerste versie van Games Backlog: bijhouden welke games je hebt gespeeld, per console en per serie.
- Startlijst met 162 games uit de notities (modern en retro, met series als Mario, Zelda, Castlevania en Final Fantasy).
- Status per game: Backlog, Bezig, Uitgespeeld of Gestopt. Tik op het rondje om door te schakelen.
- Per game: platforms, serie, beoordeling (sterren), gespeeld op, datum uitgespeeld en notities.
- Zoeken en filteren op status, modern/retro, serie en platform; sorteren per serie, A–Z, laatst gewijzigd of beoordeling.
- Voortgangsbalk met het aantal uitgespeelde games.
