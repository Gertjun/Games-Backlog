// =============================================================
//  Games Backlog — bijhouden welke games je hebt gespeeld
// =============================================================
// Datamodel (schema 2):
//   games: { id, createdAt, updatedAt, title, section ('modern'|'retro'),
//            group (serie/console-groep), platforms: string[], years: number[],
//            status ('backlog'|'playing'|'done'|'dropped'),
//            rating (0–5), playedOn, finished ('yyyy-mm-dd'), notes }
//   gameInfo: { id (= game-id), … } publieke info van Wikipedia/Wikidata
//            (score, boxart-link, genre…), zie js/enrich.js
// Schema 2: `years` toegevoegd (jaar/jaren van release). Jaar en platform
// tussen haakjes in de titel, zoals "(1985, NES)", worden labels.
// Schema 3: collectie `gameInfo` toegevoegd (Metascore in de lijst).
// Schema 4: optioneel veld `links` (sleutels van gekoppelde versies, zie
//   js/versions.js). Games uit de startlijst als "A (PCE) / B (SNES)" worden
//   losse, gekoppelde games.
// 1.6.0: games zonder jaarlabel krijgen het releasejaar uit gameInfo.
//   Optioneel veld `noAutoYear: true` = jaar zelf weggehaald, niet aanvullen.
//   Geen schemawijziging: oudere versies laten het veld gewoon staan.

import { h, today } from './core/dom.js';
import { dropdown } from './dropdown.js';
import { newRecord, alive, findById, updateById, removeById, mergeCollections, purgeTombstones } from './core/records.js';
import { SEED } from './seed.js';
import { platformIcon, platformKey } from './platforms.js';
import { findCandidates, findPage, lookupInput, loadCore, loadSummary, prefetch, candidateFrom, coreWikiUrl } from './gameinfo.js';
import { applyCorrections } from './corrections.js';
import { currentScreen, onScreenChange, setCheckCount } from './nav.js';
import { renderCheck, countIssues, resetCheckSession, parseScore } from './check.js';
import { splitSeedVersions, relatedIndex, linkKey } from './versions.js';
import { startEnrich, stopEnrich, onProgress, progress, toStored, notFound, putInfo, infoChanged, bestCandidate } from './enrich.js';

const SCHEMA = 6;
const TOMBSTONE_DAYS = 180;

const STATUS = {
  backlog: { label: 'Backlog', icon: '' },
  playing: { label: 'Bezig', icon: '▶' },
  done: { label: 'Uitgespeeld', icon: '✓' },
  dropped: { label: 'Gestopt', icon: '✕' },
};
// Tikken op het rondje: Backlog → Bezig → Uitgespeeld → Backlog
const NEXT = { backlog: 'playing', playing: 'done', done: 'backlog', dropped: 'backlog' };
const SECTION = { modern: 'Modern', retro: 'Retro' };

// Filters gelden alleen voor deze sessie (niet opgeslagen buiten de kluis).
// grouped: per serie tonen of als één lijst; sort geldt binnen elke serie.
const view = { q: '', status: '', section: '', group: '', platform: '', year: '', grouped: 'yes', sort: 'list' };

const collator = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' });
const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort(collator.compare);
const dateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = (s) => (s ? dateFmt.format(new Date(`${s}T12:00:00`)) : '');
const uniqYears = (arr) => [...new Set(arr.map(Number).filter(isYear))].sort((a, b) => a - b);

/* ---------- Jaar en platform uit de titel halen ---------- */

// Schrijfwijzen in titels → het platformlabel dat de app gebruikt
const PLATFORM_ALIASES = {
  'nintendo entertainment system': 'NES', famicom: 'NES',
  'super nintendo': 'SNES', 'super famicom': 'SNES',
  'game boy': 'GB', gameboy: 'GB', 'game boy color': 'GBC', 'game boy advance': 'GBA',
  'nintendo 64': 'N64', gamecube: 'GC', 'nintendo gamecube': 'GC',
  wiiware: 'Wii', 'nintendo ds': 'NDS', ds: 'NDS', 'nintendo 3ds': '3DS',
  'nintendo switch': 'Switch',
  playstation: 'PS1', 'playstation 1': 'PS1', psx: 'PS1', ps: 'PS1',
  'playstation 2': 'PS2', 'playstation 3': 'PS3', 'playstation 4': 'PS4', 'playstation 5': 'PS5',
  'playstation portable': 'PSP', 'pc engine': 'PCE', turbografx: 'PCE', 'turbografx-16': 'PCE',
  'sega genesis': 'Genesis', 'mega drive': 'Genesis', 'sega mega drive': 'Genesis',
};
const BASE_PLATFORMS = ['NES', 'SNES', 'GB', 'GBC', 'GBA', 'N64', 'GC', 'Wii', 'Wii U', 'NDS', '3DS',
  'Switch', 'PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PSP', 'PS Vita', 'PCE', 'Genesis', 'Xbox', 'PC'];

function isYear(n) { return Number.isInteger(n) && n >= 1970 && n <= 2100; }

function platformLookup(known = []) {
  const map = new Map(Object.entries(PLATFORM_ALIASES));
  for (const p of [...BASE_PLATFORMS, ...known]) if (p) map.set(p.toLowerCase(), p);
  return (token) => map.get(token.toLowerCase().replace(/\s+/g, ' '));
}

/**
 * Haalt stukjes als "(1985, NES)" of "(2013, Wii U/2021, Switch)" uit de titel.
 * Alleen een stukje waarvan álles herkend wordt (jaar of platform) gaat eruit;
 * iets als "(Remastered)" blijft gewoon in de titel staan.
 */
export function splitTitle(title, known = []) {
  const lookup = platformLookup(known);
  const platforms = [];
  const years = [];
  const rest = String(title || '').replace(/\s*\(([^()]*)\)/g, (whole, inner) => {
    const tokens = inner.split(/[,/]/).map((t) => t.trim()).filter(Boolean);
    if (!tokens.length) return whole;
    const found = tokens.map((t) => (/^\d{4}$/.test(t) && isYear(+t) ? { year: +t } : { platform: lookup(t) }));
    if (found.some((f) => !f.year && !f.platform)) return whole;
    for (const f of found) f.year ? years.push(f.year) : platforms.push(f.platform);
    return '';
  });
  const clean = rest.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, (m) => (/\s/.test(m) ? ' / ' : '/')).trim();
  return { title: clean || String(title || '').trim(), platforms, years };
}

/** Past splitTitle toe op een game-object en voegt de labels samen. */
function withTitleInfo(g, known) {
  const info = splitTitle(g.title, known);
  return {
    title: info.title,
    platforms: uniq([...(g.platforms || []), ...info.platforms]),
    years: uniqYears([...(g.years || []), ...info.years]),
  };
}

export const app = {
  schemaVersion: SCHEMA,

  initialData() {
    // Vaste id's, zodat de startlijst nooit dubbel raakt bij het samenvoegen.
    // updatedAt = 1: elke echte wijziging is nieuwer.
    const games = SEED.map(([section, group, title, platforms, status], i) => ({
      id: `seed-${String(i + 1).padStart(3, '0')}`,
      createdAt: 1,
      updatedAt: 1,
      title, section, group, platforms, status,
      rating: 0, playedOn: '', finished: '', notes: '',
      ...withTitleInfo({ title, platforms }),
    }));
    return applyCorrections({ schema: SCHEMA, games: splitSeedVersions(games, splitTitle), gameInfo: [] });
  },

  migrate(data) {
    data.games ??= [];
    data.games = purgeTombstones(data.games, TOMBSTONE_DAYS);
    data.gameInfo = purgeTombstones(data.gameInfo ?? [], TOMBSTONE_DAYS); // schema 3
    // Schema 2: games zonder `years` (van vóór deze versie, of net aangemaakt
    // op een apparaat met een oudere versie) krijgen hun jaar- en platformlabels
    // uit de titel. Dit is voorspelbaar, dus elk apparaat komt op hetzelfde uit;
    // updatedAt blijft daarom ongemoeid.
    const known = data.games.flatMap((g) => g.platforms || []);
    for (const g of data.games) {
      if (g.deleted || Array.isArray(g.years)) continue;
      Object.assign(g, withTitleInfo(g, known));
    }
    // Schema 4: gecombineerde games uit de startlijst splitsen in gekoppelde versies
    splitSeedVersions(data.games, (t) => splitTitle(t, known));
    // Schema 5: eenmalige verbeteringen aan titels, jaren en platforms (zie corrections.js)
    if ((data.schema || 0) < 5) applyCorrections(data);
    // Schema 6: nieuwe, optionele velden per game: myScore (eigen score, 1–100)
    // en confirmedPage (pageid van de Wikipedia-pagina die je op Controle hebt
    // bevestigd als "klopt").
    // Niets om om te zetten; het schemanummer zorgt dat een apparaat met een
    // oudere versie eerst om bijwerken vraagt, zodat het veld niet verloren gaat.
    data.schema = Math.max(data.schema || 0, SCHEMA);
    return data;
  },

  merge(local, remote) {
    return {
      ...remote,
      ...local,
      schema: Math.max(local.schema || 0, remote.schema || 0),
      games: mergeCollections(local.games, remote.games),
      gameInfo: mergeCollections(local.gameInfo, remote.gameInfo),
    };
  },

  render(root, ctx) {
    const all = alive(ctx.data.games);
    infoById = new Map(alive(ctx.data.gameInfo).map((r) => [r.id, r]));
    relatedById = relatedIndex(all);
    last = { root, ctx };
    setCheckCount(countIssues(all, infoById));
    if (currentScreen() === 'check') {
      renderCheck(root, {
        all: all.slice().sort((a, b) => collator.compare(a.title, b.title)),
        infoById, ctx,
        tags: (g) => [
          ...(g.platforms || []).map((p) => h('span', { class: 'gb-tag gb-ptag', dataset: { platform: platformKey(p) } }, platformIcon(p), p)),
          ...(g.years || []).map((y) => h('span', { class: 'gb-tag gb-tag-year' }, String(y))),
        ],
        scoreBadge: (g) => scoreBadge(infoById.get(g.id), g),
        openDetail: (id, opts) => openDetail(ctx, id, opts),
        platforms: uniq([...BASE_PLATFORMS, ...all.flatMap((g) => g.platforms || [])]),
        enrichNote: enrichLine(),
      });
      afterRender(root, ctx);
      return;
    }
    const listEl = h('div', { class: 'gb-list' });
    const chipsEl = h('div', { class: 'gb-chips', role: 'tablist', 'aria-label': 'Status' });

    // Uitklapmenu's met rechts het aantal games dat je bij die keuze ziet,
    // gerekend met de andere filters die al aan staan.
    const menus = [];
    const countFor = (key) => (v) => filterGames(all, { ...view, [key]: v }).length;
    const menu = (key, label, opts, count) => {
      const m = dropdown({
        label,
        value: () => view[key],
        options: () => opts().map(([v, text]) => [v, text, count ? count(v) : null]),
        onChange: (v) => { view[key] = v; refresh(); },
      });
      menus.push(m);
      return m.el;
    };

    const refresh = () => {
      renderChips(chipsEl, all, refresh);
      renderList(listEl, all, ctx);
      menus.forEach((m) => m.update());
    };

    const search = h('input', {
      type: 'search', value: view.q, placeholder: 'Zoek op titel, serie, platform of jaar…',
      'aria-label': 'Zoeken', autocomplete: 'off', class: 'gb-search',
      onInput: (e) => { view.q = e.target.value; refresh(); },
    });

    // De keuzes staan in groepen met een kop (Filter, Weergave, Sorteren).
    // In de zijbalk (iPad liggend, laptop) zie je de koppen en is de status
    // een uitklapmenu zoals de rest; op een smaller scherm vallen de groepen
    // weg en blijven de statusknoppen staan (zie .gb-controls in app.css).
    const group = (id, title, ...content) => h('section', { class: 'gb-ctl', 'aria-labelledby': `gb-ctl-${id}` },
      h('h2', { class: 'gb-ctl-title', id: `gb-ctl-${id}` }, title), ...content);

    const statusMenu = menu('status', 'Status',
      () => [['', 'Alle statussen'], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])], countFor('status'));
    statusMenu.classList.add('gb-dd-status');

    const controls = h('div', { class: 'gb-controls' },
      group('filter', 'Filter', chipsEl, h('div', { class: 'gb-ctl-fields' },
        statusMenu,
        menu('section', 'Categorie', () => [['', 'Alle systemen'], ['modern', 'Modern'], ['retro', 'Retro']], countFor('section')),
        menu('group', 'Serie', () => [['', 'Alle series'], ...uniq(all.map((g) => g.group)).map((v) => [v, v])], countFor('group')),
        menu('platform', 'Platform', () => [['', 'Alle platforms'], ...uniq(all.flatMap((g) => g.platforms)).map((v) => [v, v])], countFor('platform')),
        menu('year', 'Jaar van release', () => [['', 'Alle jaren'], ...uniqYears(all.flatMap((g) => g.years || [])).map((v) => [String(v), String(v)])], countFor('year')))),
      group('view', 'Weergave',
        menu('grouped', 'Weergave', () => [['yes', 'Per serie'], ['no', 'Eén lijst'], ['wall', 'Boxart-muur']])),
      group('sort', 'Sorteren',
        menu('sort', 'Sorteren', () => [['list', 'Lijstvolgorde'], ['title', 'A–Z'], ['year', 'Jaar van release'], ['score', 'Metascore'], ['recent', 'Laatst gewijzigd'], ['rating', 'Beoordeling']])));

    const pickBtn = h('button', {
      class: 'btn gb-pick-btn', type: 'button',
      onClick: () => openPicker(ctx, all),
    }, diceIcon(), 'Wat ga ik nu spelen?');

    const addBtn = h('button', {
      class: 'gb-fab', type: 'button', 'aria-label': 'Game toevoegen',
      onClick: () => openEditor(ctx, null),
    }, '+');

    // Op een telefoon staat alles onder elkaar; op iPad (liggend) en laptop
    // staan voortgang, zoeken en filters in een zijbalk naast de lijst.
    root.replaceChildren(h('div', { class: 'gb-layout' },
      h('aside', { class: 'gb-side', 'aria-label': 'Zoeken en filters' }, renderStats(all), pickBtn, search, controls),
      listEl), addBtn);
    refresh();
    afterRender(root, ctx);
  },
};

// Laatst getekende root en ctx, om bij het wisselen van scherm opnieuw te tekenen.
let last = null;
onScreenChange((screen) => {
  if (screen !== 'check') resetCheckSession();
  if (last) app.render(last.root, last.ctx);
});

function afterRender(root, ctx) {
  watchLock(root);
  detail?.refresh();
  startEnrich(ctx, SCHEMA);
  setTimeout(() => fillMissingYears(ctx), 0); // niet midden in het tekenen opslaan
}

/* ---------- Jaartal aanvullen uit de opgehaalde game-info ---------- */

// Games zonder jaarlabel krijgen het eerste releasejaar dat bij het ophalen
// van de scores en boxart is gevonden (Wikipedia/Wikidata). Alleen als die
// informatie bij de huidige titel hoort, en niet als je het jaar zelf hebt
// weggehaald (noAutoYear).
function missingYears(d) {
  const infos = new Map(alive(d.gameInfo || []).map((r) => [r.id, r]));
  return alive(d.games || []).flatMap((g) => {
    if (g.years?.length || g.noAutoYear) return [];
    const info = infos.get(g.id);
    if (!info?.found || !(info.pinned || info.query === g.title)) return [];
    const year = info.release?.year;
    return isYear(year) ? [[g.id, year]] : [];
  });
}

let fillingYears = false;
async function fillMissingYears(ctx) {
  const data = ctx.data;
  if (fillingYears || !data || (data.schema || 0) > SCHEMA || !missingYears(data).length) return;
  fillingYears = true;
  try {
    await ctx.update((d) => {
      for (const [id, year] of missingYears(d)) updateById(d.games, id, { years: [year] });
    });
  } catch {
    // Bijvoorbeeld net vergrendeld: volgende keer opnieuw
  } finally {
    fillingYears = false;
  }
}

/* ---------- Onderdelen ---------- */

function renderStats(all) {
  const done = all.filter((g) => g.status === 'done').length;
  const playing = all.filter((g) => g.status === 'playing').length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const bar = h('div', { class: 'gb-bar-fill' });
  bar.style.width = `${pct}%`; // via JS, de CSP staat geen inline style toe
  return h('section', { class: 'card gb-stats', 'aria-label': 'Voortgang' },
    h('div', { class: 'gb-stat-row' },
      h('span', {}, h('strong', {}, String(done)), ` / ${all.length} uitgespeeld`),
      h('span', {}, h('strong', {}, String(playing)), ' bezig'),
      h('strong', {}, `${pct}%`)),
    h('div', { class: 'gb-bar' }, bar),
    enrichLine());
}

/** "Scores ophalen… 42 van 160", zolang dat op de achtergrond loopt. */
function enrichLine() {
  const el = h('p', { class: 'gb-enrich', role: 'status' });
  const show = () => {
    el.hidden = !progress.active;
    el.textContent = progress.active ? `Scores en boxart ophalen… ${progress.done} van ${progress.total}` : '';
  };
  onProgress(show);
  show();
  return el;
}

function renderChips(el, all, refresh) {
  const base = filterGames(all, { ...view, status: '' });
  const count = (s) => (s ? base.filter((g) => g.status === s).length : base.length);
  el.replaceChildren(...[['', 'Alles'], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([key, label]) =>
    h('button', {
      type: 'button', role: 'tab', class: 'gb-chip', 'aria-selected': String(view.status === key),
      onClick: () => { view.status = key; refresh(); },
    }, label, h('span', { class: 'gb-chip-n' }, String(count(key))))));
}

function filterGames(list, f) {
  const q = f.q.trim().toLowerCase();
  return list.filter((g) =>
    (!f.status || g.status === f.status)
    && (!f.section || g.section === f.section)
    && (!f.group || g.group === f.group)
    && (!f.platform || (g.platforms || []).includes(f.platform))
    && (!f.year || (g.years || []).includes(Number(f.year)))
    && (!q || [g.title, g.group, ...(g.platforms || []), ...(g.years || []), g.playedOn, g.notes].join(' ').toLowerCase().includes(q)));
}

// inGroup: binnen één serie geldt bij 'Lijstvolgorde' gewoon de volgorde van
// je lijst, zonder modern eerst (anders staat bijvoorbeeld FF XVI vóór FF I).
function sortGames(list, inGroup = false) {
  const byTitle = (a, b) => collator.compare(a.title, b.title);
  const copy = [...list];
  if (view.sort === 'title') return copy.sort(byTitle);
  if (view.sort === 'year') {
    // Op eerste releasejaar, games zonder jaar onderaan
    const first = (g) => (g.years?.length ? Math.min(...g.years) : Infinity);
    return copy.sort((a, b) => first(a) - first(b) || byTitle(a, b));
  }
  if (view.sort === 'recent') return copy.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (view.sort === 'score') {
    // Hoogste score eerst, games zonder score onderaan
    const sc = (g) => mainScore(infoById.get(g.id), g)?.score ?? -1;
    return copy.sort((a, b) => sc(b) - sc(a) || byTitle(a, b));
  }
  if (view.sort === 'rating') return copy.sort((a, b) => (b.rating || 0) - (a.rating || 0) || byTitle(a, b));
  // Lijstvolgorde: modern eerst, verder de volgorde waarin ze zijn toegevoegd
  if (inGroup) return copy;
  return copy.sort((a, b) => (a.section === 'modern' ? 0 : 1) - (b.section === 'modern' ? 0 : 1));
}

function renderList(el, all, ctx) {
  const filtered = filterGames(all, view);
  if (!filtered.length) {
    el.replaceChildren(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, all.length ? 'Geen games gevonden' : 'Nog geen games'),
      h('p', { class: 'muted' }, all.length ? 'Pas je zoekopdracht of filters aan.' : 'Tik op + om een game toe te voegen.')));
    return;
  }
  if (view.grouped === 'wall') {
    el.replaceChildren(h('ul', { class: 'gb-wall', 'aria-label': 'Boxart-muur' }, sortGames(filtered).map((g) => wallTile(g, ctx))));
    return;
  }
  if (view.grouped !== 'yes') {
    el.replaceChildren(h('ul', { class: 'card gb-games' }, sortGames(filtered).map((g) => gameRow(g, ctx))));
    return;
  }
  // Eén kop per serie, ongeacht Modern of Retro: Final Fantasy staat dus één
  // keer in de lijst, met de oude én de nieuwe delen. Volgorde van de series:
  // eerst series met alleen moderne games, daarna de rest in lijstvolgorde
  // (een serie komt op de plek van zijn eerste game in je lijst).
  // De gekozen sortering geldt binnen elke serie.
  const groups = new Map();
  filtered.forEach((g, i) => {
    const key = g.group || 'Overig';
    if (!groups.has(key)) groups.set(key, { items: [], first: i, allModern: true });
    const grp = groups.get(key);
    grp.items.push(g);
    if (g.section !== 'modern') grp.allModern = false;
  });
  const ordered = [...groups].sort(([, a], [, b]) => (a.allModern ? 0 : 1) - (b.allModern ? 0 : 1) || a.first - b.first);
  el.replaceChildren(...ordered.map(([name, { items }]) => h('section', { class: 'gb-group' },
    h('h2', { class: 'gb-group-head' },
      h('span', {}, name),
      h('span', { class: 'gb-group-count' }, `${items.filter((g) => g.status === 'done').length}/${items.length}`)),
    h('ul', { class: 'card gb-games' }, sortGames(items, true).map((g) => gameRow(g, ctx))))));
}

function gameRow(g, ctx) {
  const st = STATUS[g.status] || STATUS.backlog;
  // Labels staan altijd op één regel, in volgorde van belang (zie .gb-meta in app.css):
  // 1. status, platform, jaar: altijd zichtbaar;
  // 2. "ook op …": wordt ingekort met "…" als de ruimte krap is (het icoon blijft);
  // 3. sterren, datum, notities: alleen als ze er helemaal op passen, anders weg.
  const extra = [
    g.rating ? h('span', { class: 'gb-stars', 'aria-label': `${g.rating} sterren` }, '★'.repeat(g.rating)) : null,
    g.status === 'done' && g.finished ? h('span', { class: 'gb-date' }, formatDate(g.finished)) : null,
    g.notes ? h('span', { class: 'gb-tag', title: 'Heeft notities', 'aria-label': 'Heeft notities' }, '📝') : null,
  ].filter(Boolean);
  const meta = [
    g.status === 'playing' || g.status === 'dropped' ? h('span', { class: `gb-tag gb-tag-${g.status}` }, st.label) : null,
    ...(g.platforms || []).map((p) => h('span', { class: 'gb-tag gb-ptag', dataset: { platform: platformKey(p) } }, platformIcon(p), p)),
    ...(g.years || []).map((y) => h('span', { class: 'gb-tag gb-tag-year', 'aria-label': `Uit ${y}` }, String(y))),
    versionsTag(g),
    extra.length ? h('span', { class: 'gb-meta-extra' }, extra) : null,
  ];
  return h('li', { class: 'gb-game', dataset: { status: g.status } },
    h('button', {
      class: 'gb-status', type: 'button',
      'aria-label': `${g.title}: ${st.label}. Tik voor ${STATUS[NEXT[g.status] || 'playing'].label}`,
      onClick: () => cycleStatus(ctx, g),
    }, st.icon),
    h('button', {
      class: 'gb-body', type: 'button',
      onPointerdown: () => prefetch(g, infoById.get(g.id)),
      onClick: () => openDetail(ctx, g.id),
    },
      h('span', { class: 'gb-title', title: g.title }, g.title),
      h('span', { class: 'gb-meta' }, meta)),
    scoreBadge(infoById.get(g.id), g));
}

/** Andere platforms waarop deze game (onder een andere titel) bestaat. */
function otherPlatforms(g) {
  const rel = relatedById.get(g.id) || [];
  return uniq(rel.flatMap((o) => o.platforms || []).filter((p) => !(g.platforms || []).includes(p)));
}

function versionsTag(g) {
  const rel = relatedById.get(g.id);
  if (!rel?.length) return null;
  const others = otherPlatforms(g);
  const text = others.length ? `ook op ${others.join(', ')}` : `+${rel.length} ${rel.length === 1 ? 'versie' : 'versies'}`;
  const label = `Ook verschenen als ${rel.map((o) => `${o.title}${o.platforms?.length ? ` (${o.platforms.join(', ')})` : ''}`).join(', ')}`;
  return h('span', { class: 'gb-tag gb-tag-alt', title: label, 'aria-label': label }, icon(ICON.link, 'gb-link-ico'), h('span', { class: 'gb-tag-alt-text' }, text));
}

/**
 * De score op de kaart: je eigen score (zelf ingevuld, bijvoorbeeld van
 * Metacritic), anders de Metascore, anders GameRankings (oudere retro-games).
 */
function mainScore(info, g) {
  if (g?.myScore) return { score: g.myScore, source: 'own' };
  if (!info?.found) return null;
  if (info.metacritic?.[0]) return { score: info.metacritic[0].score, source: 'mc' };
  if (info.gamerankings?.[0]) return { score: info.gamerankings[0].score, source: 'gr' };
  return null;
}

/** "Metascore 85", "GameRankings 85%" of "Eigen score 85". */
const scoreLabel = (sc) => ({ own: 'Eigen score ', mc: 'Metascore ' }[sc.source] ?? 'GameRankings ') + sc.score + (sc.source === 'gr' ? '%' : '');

function scoreBadge(info, g) {
  const sc = mainScore(info, g);
  if (!sc) return null;
  const label = scoreLabel(sc);
  return h('span', {
    class: 'gb-score', title: label, 'aria-label': label,
    dataset: { level: scoreLevel(sc.score), source: sc.source },
  }, String(sc.score));
}

async function cycleStatus(ctx, g) {
  const status = NEXT[g.status] || 'playing';
  await ctx.update((d) => {
    const changes = { status };
    if (status === 'done' && !g.finished) changes.finished = today();
    updateById(d.games, g.id, changes);
  });
  ctx.toast(`${g.title}: ${STATUS[status].label}`, status === 'done' ? 'ok' : 'info');
}

/* ---------- Boxart ---------- */

/**
 * Kleinere versie van de Wikipedia-boxart voor de muur (330 px is een van
 * de standaardformaten van Wikimedia). Andere links blijven zoals ze zijn.
 */
function wallImage(src) {
  return String(src || '').replace(/\/500px-([^/]+)$/, '/330px-$1');
}

/**
 * Hoesje met daaronder een gekleurd vlak (platformkleur, beginletter en
 * titel). Dat vlak is zichtbaar tot de boxart geladen is, en blijft staan
 * als er geen boxart is of hij niet laadt.
 */
function coverArt(g, src, { cls = '', lazy = true } = {}) {
  const first = (g.platforms || [])[0];
  const wrap = h('div', { class: `gb-cover ${cls}`.trim(), dataset: first ? { platform: platformKey(first) } : {} },
    h('div', { class: 'gb-cover-empty', 'aria-hidden': 'true' },
      first ? platformIcon(first) : null,
      h('span', { class: 'gb-cover-letter' }, (g.title.match(/[A-Za-z0-9]/)?.[0] || '?').toUpperCase()),
      h('span', { class: 'gb-cover-title' }, g.title)));
  if (src) {
    const img = h('img', {
      src, alt: '', class: 'gb-cover-img', decoding: 'async', referrerpolicy: 'no-referrer',
      loading: lazy ? 'lazy' : null,
    });
    img.addEventListener('load', () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())
      .then(() => wrap.classList.add('is-loaded')));
    img.addEventListener('error', () => img.remove());
    wrap.append(img);
  }
  return wrap;
}

function wallTile(g, ctx) {
  const info = infoById.get(g.id);
  const st = STATUS[g.status] || STATUS.backlog;
  const sc = mainScore(info, g);
  const others = relatedById.has(g.id) ? otherPlatforms(g) : [];
  const label = [g.title, st.label, ...(g.platforms || []), sc ? `score ${sc.score}` : '',
    relatedById.has(g.id) ? `ook verschenen${others.length ? ` op ${others.join(', ')}` : ' in andere versies'}` : ''].filter(Boolean).join(', ');
  return h('li', { class: 'gb-wall-item', dataset: { status: g.status } },
    h('button', {
      type: 'button', class: 'gb-wall-tile', title: g.title, 'aria-label': label,
      onPointerdown: () => prefetch(g, info),
      onClick: () => openDetail(ctx, g.id),
    },
    coverArt(g, info?.found ? wallImage(info.image) : ''),
    g.status !== 'backlog' ? h('span', { class: 'gb-wall-status', 'aria-hidden': 'true' }, st.icon) : null,
    relatedById.has(g.id) ? h('span', { class: 'gb-wall-alt', 'aria-hidden': 'true' }, icon(ICON.link, 'gb-link-ico')) : null,
    sc ? h('span', { class: 'gb-wall-score', 'aria-hidden': 'true', dataset: { level: scoreLevel(sc.score), source: sc.source } }, String(sc.score)) : null));
}

/* ---------- Wat ga ik nu spelen? ---------- */
// Kiest willekeurig een game met status Backlog, binnen de filters die op
// dat moment aanstaan (zoeken, categorie, serie, platform, jaar). Een game
// die je net al voorgesteld kreeg, komt niet meteen opnieuw.

const recentPicks = [];

function diceIcon() {
  return icon('M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01', 'gb-d-ico gb-dice');
}

function pickPool(all) {
  return filterGames(all, { ...view, status: 'backlog' });
}

function pickOne(pool, currentId) {
  // Niet dezelfde als nu, en liefst ook niet een van de laatste keuzes
  const keep = Math.min(recentPicks.length, Math.floor(pool.length / 2));
  const avoid = new Set([currentId, ...recentPicks.slice(-keep)]);
  const fresh = pool.filter((g) => !avoid.has(g.id));
  const from = fresh.length ? fresh : pool.filter((g) => g.id !== currentId);
  const choice = (from.length ? from : pool)[Math.floor(Math.random() * (from.length || pool.length))];
  recentPicks.push(choice.id);
  if (recentPicks.length > 50) recentPicks.shift();
  return choice;
}

function openPicker(ctx, all) {
  const pool = pickPool(all);
  if (!pool.length) {
    const filtered = view.q || view.section || view.group || view.platform || view.year;
    ctx.toast(filtered ? 'Geen backlog-games binnen deze filters' : 'Je backlog is leeg. Knap!', 'info');
    return;
  }
  document.querySelector('dialog.gb-pick')?.close();

  const filtersOn = [view.q && `"${view.q.trim()}"`, SECTION[view.section], view.group, view.platform, view.year].filter(Boolean);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = null;
  let spinTimer = null;

  const stage = h('div', { class: 'gb-pick-stage', 'aria-live': 'polite' });
  const rerollBtn = h('button', { type: 'button', class: 'btn', hidden: pool.length < 2, onClick: () => roll() }, diceIcon(), 'Andere suggestie');
  const detailBtn = h('button', {
    type: 'button', class: 'btn',
    onClick: () => { const id = current.id; dlg.close(); openDetail(ctx, id); },
  }, 'Bekijk details');
  const playBtn = h('button', {
    type: 'button', class: 'btn btn-primary',
    onClick: async () => {
      const g = current;
      // Accolades: de mutator mag niets teruggeven (een returnwaarde wordt de nieuwe data)
      await ctx.update((d) => { updateById(d.games, g.id, { status: 'playing' }); });
      dlg.close();
      ctx.toast(`Veel plezier met ${g.title}!`, 'ok');
    },
  }, '▶ Ga ik spelen');

  const drawResult = (g) => {
    const info = infoById.get(g.id);
    const sc = mainScore(info, g);
    stage.classList.remove('is-spinning');
    stage.replaceChildren(
      coverArt(g, info?.found ? info.image : '', { cls: 'gb-pick-cover', lazy: false }),
      h('h3', { class: 'gb-pick-title' }, g.title),
      h('div', { class: 'gb-pick-tags' },
        ...(g.platforms || []).map((p) => h('span', { class: 'gb-tag gb-ptag', dataset: { platform: platformKey(p) } }, platformIcon(p), p)),
        ...(g.years || []).map((y) => h('span', { class: 'gb-tag gb-tag-year' }, String(y))),
        sc ? h('span', {
          class: 'gb-score gb-pick-score', dataset: { level: scoreLevel(sc.score), source: sc.source },
          'aria-label': scoreLabel(sc),
        }, String(sc.score)) : null),
      g.group ? h('p', { class: 'gb-pick-group' }, g.group) : null);
  };

  function roll() {
    clearInterval(spinTimer);
    const choice = pickOne(pool, current?.id);
    current = choice;
    const buttons = [rerollBtn, detailBtn, playBtn];
    if (calm || pool.length < 3) { drawResult(choice); return; }
    // Korte "fruitautomaat": een paar titels voorbij laten flitsen
    buttons.forEach((b) => { b.disabled = true; });
    stage.classList.add('is-spinning');
    const flash = h('p', { class: 'gb-pick-flash' });
    stage.replaceChildren(h('div', { class: 'gb-cover gb-pick-cover gb-pick-blank' }), flash);
    let n = 0;
    spinTimer = setInterval(() => {
      flash.textContent = pool[Math.floor(Math.random() * pool.length)].title;
      if (++n >= 9) {
        clearInterval(spinTimer);
        drawResult(choice);
        buttons.forEach((b) => { b.disabled = false; });
      }
    }, 70);
  }

  const dlg = h('dialog', { class: 'sheet gb-modal gb-pick', 'aria-labelledby': 'gb-pick-head' },
    h('div', { class: 'sheet-header' },
      h('h2', { id: 'gb-pick-head' }, 'Wat ga ik nu spelen?'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sluiten', onClick: () => dlg.close() }, '✕')),
    h('div', { class: 'sheet-body gb-pick-body' },
      stage,
      h('p', { class: 'gb-pick-pool muted' },
        `Gekozen uit ${pool.length} ${pool.length === 1 ? 'game' : 'games'} in je backlog`,
        filtersOn.length ? ` (filter: ${filtersOn.join(', ')})` : ''),
      h('div', { class: 'gb-pick-actions' }, playBtn, detailBtn, rerollBtn)));
  dlg.addEventListener('close', () => { clearInterval(spinTimer); dlg.remove(); });
  document.body.append(dlg);
  dlg.showModal();
  roll();
}

/* ---------- Bewerken ---------- */

/** `versionOf`: id van een game waarvan je een versie op een ander platform toevoegt. */
function openEditor(ctx, id, { versionOf = null } = {}) {
  const all = alive(ctx.data.games);
  const base = versionOf ? findById(ctx.data.games, versionOf) : null;
  const g = id ? findById(ctx.data.games, id) : base ? {
    title: '', section: base.section, group: base.group || '', platforms: [], years: [], status: 'backlog',
    rating: 0, playedOn: '', finished: '', notes: '',
  } : {
    title: '', section: view.section || 'modern', group: view.group || '',
    platforms: view.platform ? [view.platform] : [], years: view.year ? [Number(view.year)] : [], status: 'backlog',
    rating: 0, playedOn: '', finished: '', notes: '',
  };
  if (!g) return;
  let rating = g.rating || 0;

  const field = (label, control) => h('label', { class: 'field' }, h('span', {}, label), control);
  const datalist = (listId, values) => h('datalist', { id: listId }, values.map((v) => h('option', { value: v })));

  const starsEl = h('div', { class: 'gb-star-input', role: 'radiogroup', 'aria-label': 'Beoordeling' });
  const drawStars = () => starsEl.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(n === rating), 'aria-label': `${n} ster${n > 1 ? 'ren' : ''}`,
    class: n <= rating ? 'is-on' : '',
    onClick: () => { rating = rating === n ? 0 : n; drawStars(); },
  }, '★')));
  drawStars();

  const form = h('form', { class: 'stack gb-form' },
    field('Titel', h('input', { name: 'title', type: 'text', value: g.title, required: true, autocomplete: 'off' })),
    h('div', { class: 'field-row' },
      field('Categorie', h('select', { name: 'section' },
        Object.entries(SECTION).map(([v, t]) => h('option', { value: v, selected: g.section === v }, t)))),
      field('Serie / groep', h('input', { name: 'group', type: 'text', value: g.group || '', list: 'gb-groups', autocomplete: 'off', placeholder: 'bv. Zelda' }))),
    field('Platforms (komma-gescheiden)', h('input', {
      name: 'platforms', type: 'text', value: (g.platforms || []).join(', '), list: 'gb-platforms', autocomplete: 'off', placeholder: 'bv. SNES, GBA',
    })),
    field('Jaar van release (komma-gescheiden)', h('input', {
      name: 'years', type: 'text', value: (g.years || []).join(', '), autocomplete: 'off', placeholder: 'bv. 1991, 2002',
    })),
    field('Eigen score (optioneel, 1–100)', h('input', {
      name: 'myScore', type: 'number', inputmode: 'numeric', min: 1, max: 100, step: 1,
      value: g.myScore || '', placeholder: 'bv. de Metascore van jouw versie',
    })),
    field('Status', h('select', { name: 'status' },
      Object.entries(STATUS).map(([v, s]) => h('option', { value: v, selected: g.status === v }, s.label)))),
    h('div', { class: 'field-row' },
      field('Gespeeld op', h('input', { name: 'playedOn', type: 'text', value: g.playedOn || '', autocomplete: 'off', placeholder: 'bv. Switch' })),
      field('Uitgespeeld op', h('input', { name: 'finished', type: 'date', value: g.finished || '' }))),
    h('div', { class: 'field' }, h('span', {}, 'Beoordeling'), starsEl),
    field('Notities', h('textarea', { name: 'notes', rows: 3 }, g.notes || '')),
    datalist('gb-groups', uniq(all.map((x) => x.group))),
    datalist('gb-platforms', uniq(all.flatMap((x) => x.platforms || []))),
    h('div', { class: 'button-row gb-form-actions' },
      id ? h('button', {
        type: 'button', class: 'btn btn-danger',
        onClick: async () => {
          if (!ctx.confirm(`"${g.title}" verwijderen?`)) return;
          await ctx.update((d) => {
            removeById(d.games, id);
            if (findById(d.gameInfo, id)) removeById(d.gameInfo, id);
          });
          close();
          ctx.toast('Verwijderd');
        },
      }, 'Verwijderen') : null,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Opslaan')));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    // Staat er toch "(1991, SNES)" in de titel? Dan worden dat labels.
    const info = withTitleInfo({
      title: v.title,
      platforms: v.platforms.split(',').map((s) => s.trim()),
      years: (v.years.match(/\d{4}/g) || []),
    }, all.flatMap((x) => x.platforms || []));
    const data = {
      title: info.title,
      section: v.section,
      group: v.group.trim(),
      platforms: info.platforms,
      years: info.years,
      status: v.status,
      playedOn: v.playedOn.trim(),
      finished: v.finished || (v.status === 'done' ? (g.finished || today()) : ''),
      rating,
      notes: v.notes.trim(),
      myScore: parseScore(v.myScore),
    };
    if (!data.title) return;
    // Jaar zelf weggehaald? Dan niet automatisch opnieuw aanvullen.
    if (id) data.noAutoYear = !data.years.length && (Boolean(g.years?.length) || Boolean(g.noAutoYear));
    await ctx.update((d) => {
      if (id) { updateById(d.games, id, data); return; }
      if (base) {
        const src = findById(d.games, base.id);
        const key = linkKey({}, src);
        if (!(src.links || []).includes(key)) updateById(d.games, src.id, { links: [...(src.links || []), key] });
        data.links = [key];
      }
      d.games.push(newRecord(data));
    });
    close();
    ctx.toast(id ? 'Opgeslagen' : base ? `${data.title} toegevoegd als versie van ${base.title}` : `${data.title} toegevoegd`, 'ok');
  });

  const dlg = h('dialog', { class: 'sheet gb-modal', 'aria-labelledby': 'gb-edit-title' },
    h('div', { class: 'sheet-header' },
      h('h2', { id: 'gb-edit-title' }, id ? 'Game bewerken' : base ? 'Versie toevoegen' : 'Game toevoegen'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sluiten', onClick: () => close() }, '✕')),
    h('div', { class: 'sheet-body' },
      base ? h('p', { class: 'gb-form-hint muted' }, `Een eigen kaart, gekoppeld aan ${base.title}.`) : null, form));
  function close() { dlg.close(); }
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (!id) form.elements.title.focus();
}

/* ---------- Detailscherm ---------- */
// Tik op een game: een volledig scherm met boxart, Metacritic-score,
// genre, ontwikkelaar, samenvatting en je eigen voortgang. De publieke
// informatie komt van Wikipedia/Wikidata (js/gameinfo.js) en wordt
// niet in de kluis opgeslagen.

let detail = null; // het open detailscherm, wordt bijgewerkt na een wijziging
let infoById = new Map(); // game-id → bewaarde info (gameInfo), per render bijgewerkt
let relatedById = new Map(); // game-id → gekoppelde versies, per render bijgewerkt
let lockObserver = null;

/** Sluit app-dialogen zodra de schil vergrendelt (dan wordt de app-inhoud leeggemaakt). */
function watchLock(root) {
  if (lockObserver) return;
  lockObserver = new MutationObserver(() => {
    if (root.childElementCount) return;
    document.querySelectorAll('dialog.gb-modal').forEach((d) => d.close());
    stopEnrich();
  });
  lockObserver.observe(root, { childList: true });
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(d, cls = 'gb-d-ico') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
const ICON = {
  back: 'M15 18l-6-6 6-6',
  edit: 'M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3zM13.5 8.5l2 2',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  plus: 'M12 5v14M5 12h14',
  retry: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
};

/** Metacritic-kleuren: groen 75+, geel 50–74, rood daaronder. */
const scoreLevel = (n) => (n >= 75 ? 'good' : n >= 50 ? 'mixed' : 'bad');

function openDetail(ctx, id, opts = {}) {
  if (!findById(ctx.data.games, id)) return;
  detail?.close();

  const ctrl = new AbortController();
  // core: boxart/scores/feiten (eerst uit de kluis, daarna vers), summary: samenvatting
  const s = {
    loading: true, error: '', core: null, summary: null, candidates: [],
    picker: false, pickerLoading: false, expanded: false, linking: false,
    manual: '', manualResults: null, manualLoading: false,
  };
  let run = 0;

  const heroEl = h('section', { class: 'gb-d-hero' });
  // Afbeeldingen één keer maken en bij elke update hergebruiken: een nieuw
  // <img> midden in het laden gaf op iPhone soms een half getoonde boxart.
  const imgs = new Map();
  const img = (src, alt, cls) => {
    const key = `${cls}|${src}`;
    if (!imgs.has(key)) imgs.set(key, coverImage(src, alt, cls));
    return imgs.get(key);
  };
  const bodyEl = h('div', { class: 'gb-d-content' });
  const dlg = h('dialog', { class: 'gb-detail gb-modal', 'aria-labelledby': 'gb-d-title' },
    h('div', { class: 'gb-d-bar' },
      h('button', { class: 'gb-d-round', type: 'button', 'aria-label': 'Terug', onClick: () => dlg.close() }, icon(ICON.back)),
      h('button', { class: 'gb-d-round gb-d-editbtn', type: 'button', onClick: () => openEditor(ctx, id) },
        icon(ICON.edit), h('span', {}, 'Bewerken'))),
    h('div', { class: 'gb-d-scroll' }, heroEl, bodyEl));

  const stored = () => findById(ctx.data.gameInfo, id);

  const draw = () => {
    const g = findById(ctx.data.games, id);
    if (!g) { dlg.close(); return; }
    heroEl.classList.remove('no-image');
    heroEl.replaceChildren(...detailHero(g, s, img).filter(Boolean));
    bodyEl.replaceChildren(...detailBody(g, s, { ctx, load, redraw: draw, openPicker, lookup }).filter(Boolean));
  };

  /** Laadt de game; met `pick` een zelf gekozen Wikipedia-pagina. */
  async function load(pick) {
    const mine = ++run;
    const g = findById(ctx.data.games, id);
    const info = stored();
    let cand = pick || (info?.found && (info.query === g.title || info.pinned) ? candidateFrom(info) : null);
    const want = !pick && !info?.found ? info?.want : '';
    // Zelf vastgelegd dat er (nog) geen pagina bij hoort: niet automatisch zoeken
    const noMatch = !pick && info?.pinned && !info.found;
    if (!pick && info?.found) s.core = info; // meteen tonen wat al bewaard is
    if (pick) { s.core = null; s.summary = null; }
    s.loading = true;
    s.error = '';
    s.picker = false;
    draw();
    try {
      if (!cand && want) cand = await findPage(want, ctrl.signal);
      if (!cand && !noMatch) {
        if (!s.candidates.length) s.candidates = await findCandidates(g, ctrl.signal);
        cand = bestCandidate(s.candidates);
        if (!cand) {
          if (mine !== run) return;
          s.core = null;
          if (!info || info.found || info.query !== g.title) await ctx.update((d) => putInfo(d, id, notFound(g.title)));
        }
      }
      if (cand) {
        const core = await loadCore(cand, ctrl.signal);
        if (mine !== run) return;
        s.core = core;
        draw();
        const pinned = Boolean(pick) || Boolean(want) || Boolean(info?.pinned && !pick && info.pageid === core.pageid);
        const fresh = toStored(core, g.title, pinned);
        if (infoChanged(stored(), fresh)) await ctx.update((d) => putInfo(d, id, fresh));
        s.summary = await loadSummary(core, ctrl.signal).catch(() => null);
      }
    } catch {
      if (ctrl.signal.aborted || mine !== run) return;
      if (!s.core) {
        s.error = navigator.onLine
          ? 'De informatie kon niet worden opgehaald. Probeer het later nog eens.'
          : 'Je bent offline. De informatie over de game wordt geladen zodra je weer verbinding hebt.';
      }
    }
    if (mine !== run) return;
    s.loading = false;
    draw();
  }

  /** "Niet de juiste game?": andere zoekresultaten tonen. */
  async function openPicker() {
    s.picker = !s.picker;
    if (s.picker && !s.candidates.length) {
      s.pickerLoading = true;
      draw();
      s.candidates = await findCandidates(findById(ctx.data.games, id), ctrl.signal).catch(() => []);
      s.pickerLoading = false;
    }
    draw();
  }

  /** Zelf ingevoerde Wikipedia-link of titel opzoeken. */
  async function lookup(text) {
    s.manual = text;
    if (!text.trim()) return;
    s.manualLoading = true;
    s.manualResults = null;
    draw();
    try {
      const found = await lookupInput(text, ctrl.signal);
      if (ctrl.signal.aborted) return;
      s.manualLoading = false;
      // Precies één pagina (een link of exacte titel): meteen gebruiken
      if (found.length === 1 && found[0].score >= 10) {
        s.manual = '';
        s.expanded = false;
        load(found[0]);
        return;
      }
      s.manualResults = found;
    } catch {
      if (ctrl.signal.aborted) return;
      s.manualLoading = false;
      s.manualResults = 'error';
    }
    draw();
  }

  dlg.addEventListener('close', () => {
    ctrl.abort();
    dlg.remove();
    if (detail?.dlg === dlg) detail = null;
  });
  detail = { dlg, refresh: draw, close: () => dlg.close() };
  document.body.append(dlg);
  dlg.showModal();
  load();
  // Vanaf Controle: meteen de andere zoekresultaten tonen
  if (opts.picker) {
    openPicker().then(() => dlg.querySelector('.gb-d-more')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
}

function coverImage(src, alt, cls) {
  const img = h('img', { src, alt, class: cls, decoding: 'async', referrerpolicy: 'no-referrer' });
  // Pas tonen als de afbeelding helemaal binnen is (tot dan een laad-animatie)
  const shown = () => img.classList.add('is-loaded');
  img.addEventListener('load', () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(shown));
  img.addEventListener('error', () => img.closest('.gb-d-hero')?.classList.add('no-image'));
  return img;
}

function detailHero(g, s, img) {
  const image = s.core?.image || '';
  const first = (g.platforms || [])[0];
  const placeholder = h('div', { class: 'gb-d-cover gb-d-cover-empty', dataset: first ? { platform: platformKey(first) } : {} },
    first ? platformIcon(first) : null,
    h('span', {}, (g.title.match(/[A-Za-z0-9]/)?.[0] || '?').toUpperCase()));

  let cover;
  if (image) cover = h('div', { class: 'gb-d-coverwrap' }, img(image, `Boxart van ${g.title}`, 'gb-d-cover'), placeholder);
  else if (s.loading) cover = h('div', { class: 'gb-d-cover gb-skel', 'aria-label': 'Boxart laden' });
  else cover = placeholder;

  const st = STATUS[g.status] || STATUS.backlog;
  const f = s.core?.facts || {};
  const year = s.core?.release?.year || (g.years?.length ? Math.min(...g.years) : null);
  const subtitle = [f.developer?.[0], year].filter(Boolean).join(' · ');

  return [
    image ? h('div', { class: 'gb-d-backdrop', 'aria-hidden': 'true' }, img(image, '', 'gb-d-bdimg')) : null,
    h('div', { class: 'gb-d-hero-inner' },
      cover,
      h('div', { class: 'gb-d-head' },
        h('h1', { id: 'gb-d-title', class: 'gb-d-title' }, g.title),
        subtitle ? h('p', { class: 'gb-d-sub' }, subtitle) : (s.loading ? h('p', { class: 'gb-d-sub gb-skel gb-skel-line' }) : null),
        h('div', { class: 'gb-d-tags' },
          h('span', { class: `gb-tag gb-d-status gb-d-status-${g.status}` }, st.icon ? `${st.icon} ` : '', st.label),
          ...(g.platforms || []).map((p) => h('span', { class: 'gb-tag gb-ptag', dataset: { platform: platformKey(p) } }, platformIcon(p), p)),
          ...(g.years || []).map((y) => h('span', { class: 'gb-tag gb-tag-year' }, String(y)))))),
  ];
}

function scoreCard(s, g) {
  const core = s.core;
  if (g.myScore) {
    // Zelf ingevuld: die gaat voor. De opgehaalde score staat er klein onder.
    const fetched = mainScore(core?.found === false ? null : { found: true, ...core });
    return h('section', { class: 'card gb-d-tile' },
      h('h2', { class: 'gb-d-label' }, 'Eigen score'),
      h('div', { class: 'gb-d-score', dataset: { level: scoreLevel(g.myScore), source: 'own' }, 'aria-label': `${g.myScore} van de 100` }, String(g.myScore)),
      h('p', { class: 'gb-d-note' }, 'Zelf ingevuld'),
      fetched ? h('ul', { class: 'gb-d-subscores' }, h('li', {},
        h('span', {}, `${fetched.source === 'mc' ? 'Metascore' : 'GameRankings'} (Wikipedia)`),
        h('strong', { dataset: { level: scoreLevel(fetched.score) } }, String(fetched.score))))
        : null);
  }
  const head = h('h2', { class: 'gb-d-label' }, 'Metascore');
  if (s.loading && !core) {
    return h('section', { class: 'card gb-d-tile' }, head, h('div', { class: 'gb-d-score gb-skel' }), h('p', { class: 'gb-skel gb-skel-line' }));
  }
  const mc = core?.metacritic || [];
  const gr = core?.gamerankings || [];
  const main = mc[0] || gr[0];
  if (!main) {
    return h('section', { class: 'card gb-d-tile' }, head,
      h('div', { class: 'gb-d-score gb-d-score-none', 'aria-label': 'Geen score' }, '–'),
      h('p', { class: 'gb-d-note' }, s.error ? 'Niet beschikbaar' : 'Geen score bekend'));
  }
  const isMc = Boolean(mc[0]);
  const list = isMc ? mc : gr;
  return h('section', { class: 'card gb-d-tile' },
    h('h2', { class: 'gb-d-label' }, isMc ? 'Metascore' : 'GameRankings'),
    h('div', { class: 'gb-d-score', dataset: { level: scoreLevel(main.score) }, 'aria-label': `${main.score} van de 100` }, String(main.score)),
    h('p', { class: 'gb-d-note' }, main.platform || (isMc ? 'Gemiddelde van recensies' : 'Gemiddelde (retro)')),
    list.length > 1 ? h('ul', { class: 'gb-d-subscores' }, list.slice(1, 5).map((r) => h('li', {},
      h('span', {}, r.platform || 'Overig'),
      h('strong', { dataset: { level: scoreLevel(r.score) } }, String(r.score))))) : null);
}

function progressCard(g, ctx) {
  const st = STATUS[g.status] || STATUS.backlog;
  const next = NEXT[g.status] || 'playing';
  return h('section', { class: 'card gb-d-tile' },
    h('h2', { class: 'gb-d-label' }, 'Jouw voortgang'),
    h('button', {
      type: 'button', class: 'gb-d-statusbtn', dataset: { status: g.status },
      'aria-label': `Status: ${st.label}. Tik voor ${STATUS[next].label}`,
      onClick: async () => {
        await ctx.update((d) => {
          const changes = { status: next };
          if (next === 'done' && !g.finished) changes.finished = today();
          updateById(d.games, g.id, changes);
        });
      },
    }, h('span', { class: 'gb-d-statusdot' }, st.icon), st.label),
    h('div', { class: 'gb-d-stars', 'aria-label': g.rating ? `${g.rating} van 5 sterren` : 'Nog geen beoordeling' },
      [1, 2, 3, 4, 5].map((n) => h('span', { class: n <= (g.rating || 0) ? 'is-on' : '' }, '★'))),
    g.status === 'done' && g.finished ? h('p', { class: 'gb-d-note' }, `Uitgespeeld ${formatDate(g.finished)}`) : null);
}

/** "Andere versies": dezelfde game op andere platforms, met koppelen en loskoppelen. */
function versionsSection(g, s, ctx, redraw) {
  const all = alive(ctx.data.games);
  const rel = relatedIndex(all).get(g.id) || [];
  const items = rel.map((o) => {
    const st = STATUS[o.status] || STATUS.backlog;
    const year = o.years?.length ? Math.min(...o.years) : null;
    return h('li', {}, h('button', {
      type: 'button', class: 'gb-v-item', dataset: { status: o.status },
      'aria-label': `${o.title}, ${(o.platforms || []).join(', ')}${year ? `, ${year}` : ''}, ${st.label}. Open details`,
      onClick: () => openDetail(ctx, o.id),
    },
    h('span', { class: 'gb-v-dot', 'aria-hidden': 'true' }, st.icon),
    h('span', { class: 'gb-v-text' },
      h('strong', {}, o.title),
      h('span', { class: 'gb-v-tags' },
        ...(o.platforms || []).map((p) => h('span', { class: 'gb-tag gb-ptag', dataset: { platform: platformKey(p) } }, platformIcon(p), p)),
        year ? h('span', { class: 'gb-tag gb-tag-year' }, String(year)) : null)),
    icon(ICON.back, 'gb-d-ico gb-v-chev')));
  });

  // Koppelen aan een game die al in je lijst staat
  const results = h('ul', { class: 'gb-v-results' });
  const link = async (other) => {
    await ctx.update((d) => {
      const a = findById(d.games, g.id);
      const b = findById(d.games, other.id);
      const key = linkKey(a, b);
      for (const x of [a, b]) if (!(x.links || []).includes(key)) updateById(d.games, x.id, { links: [...(x.links || []), key] });
    });
    s.linking = false;
    ctx.toast(`Gekoppeld aan ${other.title}`, 'ok');
  };
  const search = h('input', {
    type: 'search', class: 'gb-search', placeholder: 'Zoek de andere versie…', 'aria-label': 'Zoek een game om te koppelen', autocomplete: 'off',
    onInput: (e) => {
      const q = e.target.value.trim().toLowerCase();
      const taken = new Set([g.id, ...rel.map((o) => o.id)]);
      const hits = q ? all.filter((o) => !taken.has(o.id) && `${o.title} ${(o.platforms || []).join(' ')}`.toLowerCase().includes(q)).slice(0, 8) : [];
      results.replaceChildren(...hits.map((o) => h('li', {}, h('button', { type: 'button', class: 'gb-v-hit', onClick: () => link(o) },
        h('span', {}, o.title), h('span', { class: 'muted' }, (o.platforms || []).join(', '))))));
      if (q && !hits.length) results.replaceChildren(h('li', { class: 'gb-d-note' }, 'Geen games gevonden.'));
    },
  });

  return h('section', { class: 'card gb-d-section gb-versions' },
    h('h2', { class: 'gb-d-h2' }, icon(ICON.link, 'gb-link-ico'), 'Andere versies'),
    rel.length ? h('ul', { class: 'gb-v-list' }, items)
      : h('p', { class: 'gb-d-note' }, 'Is deze game ook onder een andere titel of op een ander platform verschenen? Voeg die versie toe of koppel een game uit je lijst.'),
    h('div', { class: 'gb-v-actions' },
      h('button', { type: 'button', class: 'btn', onClick: () => openEditor(ctx, null, { versionOf: g.id }) }, icon(ICON.plus), 'Versie toevoegen'),
      h('button', {
        type: 'button', class: 'btn', 'aria-expanded': String(s.linking),
        onClick: () => { s.linking = !s.linking; redraw(); if (s.linking) document.querySelector('.gb-versions .gb-search')?.focus(); },
      }, icon(ICON.link), 'Koppel bestaande game'),
      g.links?.length ? h('button', {
        type: 'button', class: 'gb-d-more',
        onClick: async () => {
          if (!ctx.confirm(`"${g.title}" loskoppelen van de andere versies? De kaarten zelf blijven bestaan.`)) return;
          await ctx.update((d) => { updateById(d.games, g.id, { links: [] }); });
          ctx.toast('Losgekoppeld');
        },
      }, 'Loskoppelen') : null),
    s.linking ? h('div', { class: 'gb-v-link' }, search, results) : null);
}

function detailBody(g, s, { ctx, load, redraw, openPicker, lookup }) {
  const parts = [h('div', { class: 'gb-d-tiles' }, scoreCard(s, g), progressCard(g, ctx)), versionsSection(g, s, ctx, redraw)];
  const core = s.core;
  const skeleton = (label) => h('section', { class: 'card gb-d-section', 'aria-busy': 'true', 'aria-label': label },
    h('p', { class: 'gb-skel gb-skel-line' }), h('p', { class: 'gb-skel gb-skel-line' }),
    h('p', { class: 'gb-skel gb-skel-line' }), h('p', { class: 'gb-skel gb-skel-line gb-skel-short' }));

  if (s.error) {
    parts.push(h('section', { class: 'card gb-d-section gb-d-message' },
      h('p', {}, s.error),
      h('button', { type: 'button', class: 'btn', onClick: () => load() }, icon(ICON.retry), 'Opnieuw proberen')));
  } else if (!core && !s.loading) {
    parts.push(h('section', { class: 'card gb-d-section gb-d-message' },
      h('p', {}, 'Er is geen informatie over deze game gevonden op Wikipedia.'),
      h('p', { class: 'muted' }, 'Tip: controleer de spelling van de titel via Bewerken, of kies hieronder zelf een pagina.')));
  }

  // Samenvatting
  if (s.summary?.text) {
    const paras = s.summary.text.split(/\n+/).map((t) => t.trim()).filter(Boolean);
    const long = s.summary.text.length > 420;
    parts.push(h('section', { class: 'card gb-d-section' },
      h('h2', { class: 'gb-d-h2' }, 'Over de game'),
      h('div', { class: `gb-d-summary${long && !s.expanded ? ' is-clamped' : ''}`, lang: s.summary.lang },
        paras.map((t) => h('p', {}, t))),
      long ? h('button', {
        type: 'button', class: 'gb-d-more', 'aria-expanded': String(s.expanded),
        onClick: () => { s.expanded = !s.expanded; redraw(); },
      }, s.expanded ? 'Minder tonen' : 'Lees meer') : null,
      s.summary.lang === 'en' ? h('p', { class: 'gb-d-note' }, 'Samenvatting in het Engels; er is geen Nederlands artikel.') : null));
  } else if (s.loading && !s.error) {
    parts.push(skeleton('Samenvatting laden'));
  }

  // Details
  if (core) {
    const f = core.facts || {};
    const rows = [
      ['Ontwikkelaar', f.developer], ['Uitgever', f.publisher],
      ['Eerste release', core.release ? [core.release.text] : []],
      ['Spelmodi', f.modes], ['Serie', f.series], ['Regie', f.director], ['Muziek', f.composer],
    ].filter(([, v]) => v?.length);
    if (f.genre?.length || rows.length) {
      parts.push(h('section', { class: 'card gb-d-section' },
        h('h2', { class: 'gb-d-h2' }, 'Details'),
        f.genre?.length ? h('div', { class: 'gb-d-genres', 'aria-label': 'Genre' }, f.genre.map((x) => h('span', { class: 'gb-d-genre' }, x))) : null,
        rows.length ? h('dl', { class: 'gb-d-facts' }, rows.map(([k, v]) => h('div', {},
          h('dt', {}, k), h('dd', {}, v.join(', '))))) : null));
    }
  } else if (s.loading && !s.error) {
    parts.push(skeleton('Details laden'));
  }

  // Eigen gegevens
  const mine = [
    ['Gespeeld op', g.playedOn], ['Uitgespeeld op', g.finished ? formatDate(g.finished) : ''],
  ].filter(([, v]) => v);
  if (mine.length || g.notes) {
    parts.push(h('section', { class: 'card gb-d-section' },
      h('h2', { class: 'gb-d-h2' }, 'Jouw notities'),
      mine.length ? h('dl', { class: 'gb-d-facts' }, mine.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))) : null,
      g.notes ? h('p', { class: 'gb-d-notes' }, g.notes) : null));
  }

  // Bron, links en een andere pagina kiezen als de match niet klopt
  const others = s.candidates.filter((c) => c.pageid !== core?.pageid);
  const ext = (href, text) => h('a', { class: 'gb-d-link', href, target: '_blank', rel: 'noopener noreferrer' }, text, icon(ICON.external));
  const pickerList = (list) => h('ul', { class: 'card gb-d-picker' }, list.map((c) => h('li', {},
    h('button', {
      type: 'button',
      onClick: () => { s.expanded = false; s.manual = ''; s.manualResults = null; load(c); },
    },
    c.thumb ? h('img', { src: c.thumb, alt: '', class: 'gb-d-pthumb', referrerpolicy: 'no-referrer' }) : h('span', { class: 'gb-d-pthumb' }),
    h('span', { class: 'gb-d-ptext' }, h('strong', {}, c.title), c.description ? h('span', {}, c.description) : null)))));
  parts.push(h('footer', { class: 'gb-d-foot' },
    h('div', { class: 'gb-d-links' },
      core ? ext(s.summary?.url || coreWikiUrl(core), 'Wikipedia') : null,
      ext(`https://www.metacritic.com/search/${encodeURIComponent(g.title)}/`, 'Metacritic')),
    core && norm(core.title) !== norm(g.title) ? h('p', { class: 'gb-d-note' }, `Gevonden als "${core.title}"`) : null,
    s.loading && !core ? null : h('button', {
      type: 'button', class: 'gb-d-more', 'aria-expanded': String(s.picker), onClick: openPicker,
    }, core ? 'Niet de juiste game?' : 'Zelf een pagina kiezen'),
    s.picker && s.pickerLoading ? h('p', { class: 'gb-d-note' }, 'Zoeken…') : null,
    s.picker && !s.pickerLoading ? (others.length ? pickerList(others) : h('p', { class: 'gb-d-note' }, 'Geen andere resultaten gevonden.')) : null,
    s.picker && !s.pickerLoading ? manualLookup(s, lookup, pickerList, core) : null,
    h('p', { class: 'gb-d-source' }, 'Informatie en boxart: Wikipedia en Wikidata.')));

  return parts;
}

/** Zelf een Wikipedia-link of titel invoeren onder de zoekresultaten. */
function manualLookup(s, lookup, pickerList, core) {
  const input = h('input', {
    type: 'text', class: 'gb-search', value: s.manual, inputmode: 'url', autocomplete: 'off', autocapitalize: 'off',
    spellcheck: 'false', enterkeyhint: 'search', id: 'gb-d-manual',
    placeholder: 'https://en.wikipedia.org/wiki/…',
    onInput: (e) => { s.manual = e.target.value; },
  });
  const res = s.manualResults;
  const shown = Array.isArray(res) ? res.filter((c) => c.pageid !== core?.pageid) : [];
  let after = null;
  if (s.manualLoading) after = h('p', { class: 'gb-d-note' }, 'Zoeken…');
  else if (res === 'error') {
    after = h('p', { class: 'gb-d-note' }, navigator.onLine
      ? 'Zoeken lukte niet. Probeer het later nog eens.' : 'Je bent offline.');
  } else if (Array.isArray(res)) {
    after = shown.length ? pickerList(shown) : h('p', { class: 'gb-d-note' }, res.length
      ? 'Dat is de pagina die nu al gebruikt wordt.' : 'Geen pagina gevonden. Controleer de link of de titel.');
  }
  return h('form', {
    class: 'gb-d-manual',
    onSubmit: (e) => { e.preventDefault(); lookup(input.value); },
  },
  h('label', { for: 'gb-d-manual', class: 'gb-d-note' }, 'Staat de juiste game er niet bij? Plak de Wikipedia-link of typ de titel.'),
  h('div', { class: 'gb-d-manual-row' },
    input,
    h('button', { type: 'submit', class: 'btn', disabled: s.manualLoading }, 'Zoeken')),
  after);
}

const norm = (t) => String(t || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '');
