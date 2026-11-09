// =============================================================
//  Versies: dezelfde game op een ander platform, onder een andere titel
// =============================================================
// Elke titel/platform-combinatie is een eigen game (eigen kaart en status).
// Games die bij elkaar horen delen een sleutel in `links` (schema 4), zoals
// Castlevania: Rondo of Blood (PCE), Dracula X (SNES) en The Dracula X
// Chronicles (PSP). Een game kan in meer groepen zitten: The Dracula X
// Chronicles hoort bij Rondo of Blood én bij Symphony of the Night.
// Alleen games die echt een sleutel delen zijn aan elkaar gekoppeld.

import { SEED } from './seed.js';

const seedId = (i) => `seed-${String(i + 1).padStart(3, '0')}`;
const sameTitle = (a, b) => String(a).toLowerCase().trim() === String(b).toLowerCase().trim();
const samePlatforms = (a = [], b = []) => a.length === b.length && a.every((p) => b.includes(p));
const mentions = (text, platform) =>
  new RegExp(`(^|[^a-z0-9])${platform.replace(/[^a-z0-9]/gi, '\\$&')}([^a-z0-9]|$)`, 'i').test(text || '');

/**
 * Splitst games uit de startlijst die als "Titel A (PCE) / Titel B (SNES)"
 * zijn ingevoerd in losse, gekoppelde games (muteert `games`).
 * Voorspelbaar: elk apparaat komt op dezelfde id's en waarden uit, zodat
 * synchroniseren geen dubbele kaarten geeft. Alleen als de titel nog precies
 * zo is als in de startlijst; zelf aangepaste games blijven ongemoeid.
 * Je eigen status, beoordeling en notities gaan naar de versie waarvan het
 * platform in "Gespeeld op" staat, en anders naar de eerste versie.
 */
export function splitSeedVersions(games, splitTitle) {
  const byId = new Map(games.map((g) => [g.id, g]));
  SEED.forEach(([, , raw], i) => {
    const segments = raw.split(/\s+\/\s+/);
    if (segments.length < 2) return;
    const id = seedId(i);
    const g = byId.get(id);
    if (!g || g.deleted || Array.isArray(g.links)) return;
    if (g.title !== splitTitle(raw).title) return;

    const pieces = segments.map((s) => splitTitle(s));
    let owner = pieces.findIndex((p) => p.platforms.some((pl) => mentions(g.playedOn, pl)));
    if (owner < 0) owner = 0;
    const personal = {
      status: g.status, rating: g.rating || 0, finished: g.finished || '',
      notes: g.notes || '', playedOn: g.playedOn || '',
    };
    const blank = { status: 'backlog', rating: 0, finished: '', notes: '', playedOn: '' };

    const extra = [];
    pieces.forEach((p, k) => {
      const fields = { title: p.title, platforms: p.platforms, years: p.years, ...(k === owner ? personal : blank) };
      if (k === 0) {
        Object.assign(g, fields, { links: [id] });
        return;
      }
      // Bestaat deze versie al (bijvoorbeeld uit een andere groep)? Dan alleen koppelen.
      const existing = games.find((x) => !x.deleted && x !== g && sameTitle(x.title, p.title) && samePlatforms(x.platforms, p.platforms));
      if (existing) {
        existing.links = [...new Set([...(existing.links || [existing.id]), id])];
        if (k === owner && existing.status === 'backlog') Object.assign(existing, personal);
        return;
      }
      const pid = `${id}-${k + 1}`;
      if (byId.has(pid)) return; // eerder gemaakt en later verwijderd
      const rec = {
        id: pid, createdAt: 1, updatedAt: 1, section: g.section, group: g.group,
        ...fields, links: [id],
      };
      byId.set(pid, rec);
      extra.push(rec);
    });
    // Direct achter het origineel, zodat de lijstvolgorde klopt
    games.splice(games.indexOf(g) + 1, 0, ...extra);
  });
  return games;
}

/** Map van game-id → gekoppelde games (zonder de game zelf). */
export function relatedIndex(all) {
  const byKey = new Map();
  for (const g of all) for (const k of g.links || []) {
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(g);
  }
  const out = new Map();
  for (const g of all) {
    const set = new Set();
    for (const k of g.links || []) for (const o of byKey.get(k)) if (o !== g) set.add(o);
    if (set.size) out.set(g.id, [...set]);
  }
  return out;
}

/** De sleutel waarmee `a` aan `b` gekoppeld wordt (a sluit aan bij de groep van b). */
export function linkKey(a, b) {
  return b.links?.[0] || a.links?.[0] || b.id;
}
