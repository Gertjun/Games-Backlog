// =============================================================
//  Eenmalige correcties op de startlijst (schema 5, versie 1.15.0)
// =============================================================
// Verbeteringen die Geert heeft doorgegeven: titels, jaren, platforms,
// categorie en de juiste Wikipedia-pagina voor de score.
//
// Alleen games uit de startlijst (id begint met "seed-") waarvan de titel nog
// precies zo is als hieronder bij `from`. Heb je een game zelf al aangepast,
// dan blijft die ongemoeid. Voorspelbaar: elk apparaat komt op dezelfde
// waarden en id's uit, zodat synchroniseren geen dubbele kaarten geeft.
//
// `wiki`: de Wikipedia-pagina waar de score en boxart vandaan moeten komen.
//   De app haalt die pagina bij de eerstvolgende keer ophalen op en legt hem
//   vast (pinned), zodat er niet opnieuw een verkeerde game wordt gevonden.
// `noMatch`: (nog) geen pagina zoeken, bijvoorbeeld voor een game die nog
//   moet uitkomen. Kies je later zelf een pagina, dan geldt die.

import { putInfo } from './enrich.js';

const CORRECTIONS = [
  // Modern
  { from: 'Kingdom Come: Deliverance 2', set: { years: [2025] }, wiki: 'Kingdom Come: Deliverance II' },
  { from: 'Last of Us Part 1', set: { years: [2022] }, wiki: 'The Last of Us Part I' },
  { from: 'Last of Us Part 2', set: { years: [2020] }, wiki: 'The Last of Us Part II' },
  { from: 'Horizon Zero Dawn Remastered', set: { years: [2024] } },
  { from: 'Mass Effect 1', set: { years: [2021] }, wiki: 'Mass Effect Legendary Edition' },
  { from: 'Mass Effect 2', set: { years: [2021] }, wiki: 'Mass Effect Legendary Edition' },
  { from: 'Mass Effect 3', set: { years: [2021] }, wiki: 'Mass Effect Legendary Edition' },
  { from: "Hogwart's Legacy", set: { title: 'Hogwarts Legacy' }, wiki: 'Hogwarts Legacy' },
  { from: 'Lego Harry Potter', set: { title: 'Lego Harry Potter Collection', years: [2016] }, wiki: 'Lego Harry Potter: Years 1–4' },
  { from: 'Wukong: Fallen Dynasty', set: { title: 'Wo Long: Fallen Dynasty', years: [2023] }, wiki: 'Wo Long: Fallen Dynasty' },
  { from: 'Until Dawn 2', set: { years: [] }, noMatch: true },
  { from: 'Death Stranding', set: { years: [2021] } },
  { from: 'Skyrim', set: { years: [2021] } },
  { from: 'Assassins Creed Shadows', set: { title: "Assassin's Creed Shadows" } },
  { from: 'Callisto Protocol', set: { title: 'The Callisto Protocol' } },
  // Final Fantasy: de nieuwe delen naar Modern, wel in de serie Final Fantasy
  { from: 'Final Fantasy XIV reboot', set: { section: 'modern' } },
  { from: 'Final Fantasy XV', set: { section: 'modern' } },
  { from: 'Final Fantasy XVI', set: { section: 'modern' } },
  { from: 'Final Fantasy Crystal Chronicle', set: { title: 'Final Fantasy Crystal Chronicles' } },
  // Pokémon: platforms, en de originele Ruby/Sapphire (niet de 3DS-remake)
  { from: 'Pokemon Red/Blue/Yellow', set: { platforms: ['GB'] } },
  { from: 'Pokemon Heartgold/Soulsilver', set: { platforms: ['NDS'] } },
  { from: 'Pokemon Ruby/Sapphire/Emerald', set: { platforms: ['GBA'], years: [2002] }, wiki: 'Pokémon Ruby and Sapphire' },
  { from: 'Pokemon White/Black', set: { platforms: ['NDS'] } },
  { from: 'Pokemon White 2/Black 2', set: { platforms: ['NDS'] } },
  { from: 'Pokemon X/Y', set: { platforms: ['3DS'] } },
  // Castlevania
  { from: 'Castevania - Dawn of Sorrow', set: { title: 'Castlevania - Dawn of Sorrow' } },
  { from: 'Castlevania II - Simons Quest', set: { title: "Castlevania II - Simon's Quest" } },
  { from: 'Castlevania - Order of Ecclesia', set: { years: [2008] } },
  // Mario: de Wii-versie had dezelfde titel als de DS-versie
  { from: 'New Super Mario Bros.', platform: 'Wii', set: { title: 'New Super Mario Bros. Wii' }, wiki: 'New Super Mario Bros. Wii' },
  // Zelda: twee games, dus twee kaarten
  {
    from: 'Oracle of Seasons & Oracle of Ages', set: { title: 'Oracle of Seasons' },
    wiki: 'The Legend of Zelda: Oracle of Seasons and Oracle of Ages',
    split: { suffix: 'ages', title: 'Oracle of Ages' },
  },
];

/** Past de correcties toe (muteert `data`). Alleen aanroepen bij schema < 5. */
export function applyCorrections(data) {
  data.games ??= [];
  const now = Date.now();
  for (const c of CORRECTIONS) {
    const g = data.games.find((x) => !x.deleted && String(x.id).startsWith('seed-') && x.title === c.from
      && (!c.platform || (x.platforms || []).includes(c.platform)));
    if (!g) continue;
    Object.assign(g, c.set, { updatedAt: now });
    setInfo(data, g, c);

    if (c.split) {
      const id = `${g.id}-${c.split.suffix}`;
      if (data.games.some((x) => x.id === id)) continue; // al gemaakt (of later verwijderd)
      const copy = {
        id, createdAt: now, updatedAt: now,
        title: c.split.title, section: g.section, group: g.group,
        platforms: [...(g.platforms || [])], years: [...(g.years || [])],
        status: g.status || 'backlog', rating: 0, playedOn: g.playedOn || '', finished: g.finished || '', notes: '',
      };
      data.games.splice(data.games.indexOf(g) + 1, 0, copy);
      setInfo(data, copy, c);
    }
  }
  return data;
}

/** Zet de score-informatie klaar om (opnieuw) op te halen. */
function setInfo(data, g, c) {
  if (c.noMatch) putInfo(data, g.id, { query: g.title, pinned: true, found: false, fetchedAt: Date.now() });
  else if (c.wiki) putInfo(data, g.id, { query: '', pinned: false, found: false, fetchedAt: 0, want: c.wiki });
}
