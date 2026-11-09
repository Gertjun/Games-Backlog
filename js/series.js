// =============================================================
//  Series: eenmalige indeling en een hele serie ophalen
// =============================================================
//   assignKnownSeries(games, now) → zet losse games in hun serie (schema 8)
//   searchSeries(text)            → series op Wikidata, bijvoorbeeld "Professor Layton"
//   loadSeriesGames(qid)          → alle games uit die serie, oudste eerst
//
// Alleen de zoekterm gaat naar Wikidata; er wordt niets uit de kluis meegestuurd.

import { api, withTimeout, WIKIDATA } from './gameinfo.js';

// Geen game: de serie zelf, of iets anders uit dezelfde reeks (film, boek, …)
const NOT_A_GAME = /\b(series|franchise|character|film|novel|manga|anime|soundtrack|album|song|episode|television|board game|card game|book)\b/i;

/* ---------- Eenmalige indeling (schema 8) ---------- */

// Alleen games die nog onder Overig (of zonder serie) staan. Heb je zelf al
// een serie gekozen, dan blijft die staan.
const KNOWN = [
  [/^mass effect\b/i, 'Mass Effect'],
  [/^horizon (zero dawn|forbidden west)\b/i, 'Horizon'],
  [/^(the )?last of us\b/i, 'The Last of Us'],
  [/^(star wars )?jedi\b/i, 'Star Wars Jedi'],
  [/^mafia\b/i, 'Mafia'],
  [/^chrono (trigger|cross)\b/i, 'Chrono'],
];

export function assignKnownSeries(games, now) {
  for (const g of games) {
    if (g.deleted || (g.group?.trim() && g.group !== 'Overig')) continue;
    const hit = KNOWN.find(([re]) => re.test(g.title || ''));
    if (hit) Object.assign(g, { group: hit[1], updatedAt: now });
  }
}

/* ---------- Een hele serie ophalen van Wikidata ---------- */

const P = { instanceOf: 'P31', series: 'P179', released: 'P577', platform: 'P400' };
const VIDEO_GAME = 'Q7889';

// Wikidata-namen van platforms → de korte namen in de app. Volgorde telt:
// "Nintendo 3DS" moet vóór "Nintendo DS" staan, "Wii U" vóór "Wii".
const PLATFORM_NAMES = [
  [/super (nintendo|famicom)|^snes$/i, 'SNES'],
  [/^(nintendo entertainment system|famicom|family computer)$/i, 'NES'],
  [/^nintendo 64$/i, 'N64'],
  [/gamecube/i, 'GC'],
  [/^wii u$/i, 'Wii U'],
  [/^wii$/i, 'Wii'],
  [/nintendo switch 2/i, 'Switch 2'],
  [/nintendo switch/i, 'Switch'],
  [/game boy advance/i, 'GBA'],
  [/game boy color/i, 'GBC'],
  [/^game boy$/i, 'GB'],
  [/3ds/i, '3DS'],
  [/^nintendo dsi?( xl)?$/i, 'NDS'],
  [/playstation portable/i, 'PSP'],
  [/playstation vita/i, 'PS Vita'],
  [/^playstation 5$/i, 'PS5'],
  [/^playstation 4$/i, 'PS4'],
  [/^playstation 3$/i, 'PS3'],
  [/^playstation 2$/i, 'PS2'],
  [/^playstation( 1)?$/i, 'PS1'],
  [/xbox series/i, 'Xbox Series'],
  [/xbox one/i, 'Xbox One'],
  [/xbox 360/i, 'Xbox 360'],
  [/^xbox$/i, 'Xbox'],
  [/turbografx|pc engine/i, 'PCE'],
  [/genesis|mega drive/i, 'Genesis'],
  [/windows|ms-dos|^personal computer$|macos|^linux$/i, 'PC'],
];
const platformName = (label) => PLATFORM_NAMES.find(([re]) => re.test(label || ''))?.[1] || '';

// Deze platforms tellen als Modern; de rest als Retro. Pc pas vanaf 2013.
const MODERN = new Set(['PS4', 'PS5', 'Xbox One', 'Xbox Series', 'Switch 2']);
export const sectionFor = (platforms, year) =>
  platforms.some((p) => MODERN.has(p) || (p === 'PC' && year >= 2013)) ? 'modern' : 'retro';

/** "Final Fantasy (video game series)" → "Final Fantasy" */
export const cleanSeriesName = (s) => String(s || '')
  .replace(/\s*\((video ?game )?(series|franchise)\)$/i, '')
  .replace(/\s+(video ?game )?(series|franchise)$/i, '')
  .trim();

export async function searchSeries(text, signal) {
  const t = withTimeout(signal);
  try {
    const json = await api(WIKIDATA, {
      action: 'wbsearchentities', search: text, language: 'en', uselang: 'en', type: 'item', limit: '15',
    }, t.signal);
    // Een serie zelf ("video game series"), niet iets dat er alleen bij hoort:
    // een losse game "in the … franchise", een personage "from the … series"
    // of een "universe of the … franchise".
    const desc = (r) => r.description || '';
    const isSeries = (r) => /\b(series|franchise|reeks)\b/i.test(desc(r))
      && !/\b(in|of|from|within|part of) the\b.*\b(series|franchise|reeks)\b/i.test(desc(r))
      && !/\b(character|fictional|universe|episode|season)\b/i.test(desc(r));
    const all = (json.search || []).map((r) => ({ qid: r.id, label: r.label || r.id, description: r.description || '' }));
    const series = all.filter(isSeries);
    if (series.length) return { results: series, onlySeries: true };
    // Geen serie gevonden: toon de rest (zonder films, personages en dergelijke)
    const isMedia = (r) => /\b(film|anime|manga|novel|television|tv|album|song|character|fictional|universe|company)\b/i.test(desc(r));
    return { results: all.filter((r) => !isMedia(r)), onlySeries: false };
  } finally {
    t.done();
  }
}

const claimsOf = (claims, prop) => (claims?.[prop] || []).filter((c) => c.rank !== 'deprecated');
const idOf = (snak) => snak?.datavalue?.value?.id || '';
const yearOf = (snak) => {
  const m = /^\+?(\d{4})-/.exec(snak?.datavalue?.value?.time || '');
  return m ? Number(m[1]) : null;
};

async function entities(ids, props, signal) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const json = await api(WIKIDATA, {
      action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props, languages: 'en|nl', sitefilter: 'enwiki',
    }, signal);
    Object.assign(out, json.entities || {});
  }
  return out;
}

/**
 * Alle games waarvan Wikidata zegt dat ze bij deze serie horen (P179).
 * Per game: titel, jaar, voorgesteld platform, alle bekende platforms en de
 * Engelse Wikipedia-pagina (voor score en boxart).
 */
export async function loadSeriesGames(qid, signal) {
  const t = withTimeout(signal);
  try {
    const found = await api(WIKIDATA, {
      action: 'query', list: 'search', srsearch: `haswbstatement:${P.series}=${qid}`, srnamespace: '0', srlimit: '200',
    }, t.signal);
    const ids = (found.query?.search || []).map((r) => r.title).filter((id) => /^Q\d+$/.test(id));
    if (!ids.length) return [];

    const ents = await entities(ids, 'labels|descriptions|claims|sitelinks', t.signal);
    const raw = [];
    const platformIds = new Set();
    for (const e of Object.values(ents)) {
      if (!e || e.missing !== undefined) continue;
      const desc = e.descriptions?.en?.value || e.descriptions?.nl?.value || '';
      const types = claimsOf(e.claims, P.instanceOf).map((c) => idOf(c.mainsnak));
      const plats = claimsOf(e.claims, P.platform).map((c) => idOf(c.mainsnak)).filter(Boolean);
      if (!(types.includes(VIDEO_GAME) || plats.length) || NOT_A_GAME.test(desc)) continue;
      // Releases met hun platform (kwalificatie), om het oorspronkelijke platform te vinden
      const releases = claimsOf(e.claims, P.released)
        .map((c) => ({ year: yearOf(c.mainsnak), platforms: (c.qualifiers?.[P.platform] || []).map(idOf).filter(Boolean) }))
        .filter((r) => r.year)
        .sort((a, b) => a.year - b.year);
      [...plats, ...releases.flatMap((r) => r.platforms)].forEach((id) => platformIds.add(id));
      const wiki = e.sitelinks?.enwiki?.title || '';
      raw.push({
        qid: e.id,
        title: (wiki.replace(/\s*\((\d{4} )?video game\)$/i, '') || e.labels?.en?.value || e.labels?.nl?.value || '').trim(),
        description: desc, wiki, plats, releases,
      });
    }

    const pEnts = platformIds.size ? await entities([...platformIds], 'labels', t.signal) : {};
    const nameOf = (id) => platformName(pEnts[id]?.labels?.en?.value || pEnts[id]?.labels?.nl?.value);
    const names = (list) => [...new Set(list.map(nameOf).filter(Boolean))];

    return raw
      .filter((g) => g.title)
      .map((g) => {
        const options = names([...g.plats, ...g.releases.flatMap((r) => r.platforms)]);
        const firstWithPlatform = g.releases.find((r) => names(r.platforms).length);
        const platform = firstWithPlatform ? names(firstWithPlatform.platforms)[0] : names(g.plats)[0] || '';
        const year = g.releases[0]?.year || null;
        return { qid: g.qid, title: g.title, description: g.description, wiki: g.wiki, year, platform, options };
      })
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title));
  } finally {
    t.done();
  }
}
