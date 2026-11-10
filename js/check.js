// =============================================================
//  Controle: games waarvan informatie mist of onduidelijk is
// =============================================================
// Een game komt op Controle als:
//   - er geen score is (en je hebt de Metascore ook niet handmatig ingevuld);
//   - de gevonden Wikipedia-pagina mogelijk over een andere versie gaat:
//     de titel komt niet overeen (bijvoorbeeld "Horizon Zero Dawn" bij de
//     Remastered), of het releasejaar wijkt meer dan een jaar af van het jaar
//     op de kaart (bijvoorbeeld 2011 bij Skyrim Anniversary Edition uit 2021);
//   - het jaar of het platform ontbreekt;
//   - er geen boxart is.
// Score en boxart worden pas beoordeeld als de informatie is opgehaald.
//
// Oplossen kan direct in de lijst: een handmatige Metascore, een jaar of een platform
// invullen, een andere Wikipedia-pagina kiezen, of bevestigen dat de gevonden
// pagina klopt (veld confirmedPage op de game). Een opgeloste game blijft zichtbaar (met "Opgelost") tot je
// het scherm verlaat, zodat de lijst niet onder je vinger verspringt.
//
// Bovenaan kies je tussen Informatie (hierboven) en Series: welke games uit
// je series nog niet in je lijst staan (js/series-check.js).

import { h } from './core/dom.js';
import { findById, updateById } from './core/records.js';
import { renderSeriesCheck } from './series-check.js';

export const ISSUE_GROUPS = [
  ['score', 'Geen score'],
  ['version', 'Mogelijk andere versie'],
  ['meta', 'Geen jaar of platform'],
  ['art', 'Geen boxart'],
];

/* ---------- Herkennen ---------- */

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16 };
const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'part', 'video', 'game']);
const SAME = { remastered: 'remake', remaster: 'remake', remade: 'remake' };

function titleWords(t) {
  return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(Boolean)
    .map((w) => String(ROMAN[w] ?? SAME[w] ?? w))
    .filter((w) => !STOP.has(w));
}

/** Staat elk woord uit de titel van de game ook in de titel van de pagina? */
function titleCovered(gameTitle, pageTitle) {
  const page = new Set(titleWords(pageTitle));
  return titleWords(gameTitle).every((w) => page.has(w));
}

const hasFetchedScore = (info) => Boolean(info?.found && (info.metacritic?.[0] || info.gamerankings?.[0]));

/** Is de informatie opgehaald voor de huidige titel (en niet nog onderweg)? */
const isFetched = (g, info) => Boolean(info && !info.want && (info.pinned || info.query === g.title)
  && (info.found || info.fetchedAt));

/** Alle punten om na te kijken voor deze game: [{ key, group, label, detail? }]. */
export function findIssues(g, info) {
  const out = [];
  if (!g.platforms?.length) out.push({ key: 'platform', group: 'meta', label: 'Geen platform' });
  if (!g.years?.length) out.push({ key: 'year', group: 'meta', label: 'Geen jaar' });
  if (!isFetched(g, info)) return out;

  if (!g.myScore && !hasFetchedScore(info)) {
    out.push({ key: 'score', group: 'score', label: 'Geen score', detail: info.found ? '' : 'Geen Wikipedia-pagina gevonden.' });
  }
  if (!info.found || !info.image) out.push({ key: 'art', group: 'art', label: 'Geen boxart' });
  if (!g.myScore && info.found && g.confirmedPage !== info.pageid) {
    const pageYear = info.release?.year;
    const myYear = g.years?.length ? Math.min(...g.years) : null;
    const yearOff = Boolean(pageYear && myYear && Math.abs(pageYear - myYear) > 1);
    const titleOff = !info.pinned && !titleCovered(g.title, info.title);
    if (yearOff || titleOff) {
      out.push({
        key: 'version', group: 'version', label: 'Mogelijk andere versie',
        detail: `Score en boxart komen van "${info.title}"${pageYear ? ` (${pageYear})` : ''}.`,
      });
    }
  }
  return out;
}

/** Score (1–100) uit een invoerveld: een heel getal van 1 tot en met 100, anders 0 (= geen). */
export function parseScore(v) {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const n = Math.round(Number(s.replace(',', '.')));
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 0;
}

/* ---------- Scherm ---------- */

const state = { filter: '', tab: 'info' }; // tab: 'info' of 'series'
const seen = new Set(); // games die in deze sessie op Controle stonden
let lastRender = null; // laatste root en deps, om na het ophalen van series opnieuw te tekenen

/** Bij het verlaten van het scherm: opgeloste games mogen weer weg. */
export function resetCheckSession() { seen.clear(); state.filter = ''; }

/** Opnieuw tekenen terwijl de series worden opgehaald, maar alleen als Series nog in beeld is. */
function redrawSeries() {
  const l = lastRender;
  if (l && state.tab === 'series' && l.root.isConnected && l.root.querySelector('.gb-sc')) renderCheck(l.root, l.deps);
}

/** Aantal games om na te kijken (voor het getal in de navigatie). */
export const countIssues = (games, infoById) => games.filter((g) => findIssues(g, infoById.get(g.id)).length).length;

/**
 * Tekent Controle in `root`.
 * deps: { all, infoById, ctx, tags(g), scoreBadge(g), openDetail(id, opts),
 *         platforms (lijst om uit te kiezen), enrichNote (element of null) }
 */
export function renderCheck(root, deps) {
  const { all, infoById, ctx } = deps;
  lastRender = { root, deps };

  // Focus bewaren: opslaan gebeurt als je een veld verlaat, en daarna wordt
  // het scherm opnieuw getekend. Dan moet je in het volgende veld blijven.
  const active = document.activeElement;
  const focusKey = root.contains(active) ? active?.dataset?.focus : '';

  const rows = all
    .map((g) => ({ g, issues: findIssues(g, infoById.get(g.id)) }))
    .filter(({ g, issues }) => issues.length || seen.has(g.id));
  for (const { g, issues } of rows) if (issues.length) seen.add(g.id);

  const open = rows.filter((r) => r.issues.length);

  // Tabs: Informatie en Series
  const tabs = h('div', { class: 'gb-check-tabs', role: 'tablist', 'aria-label': 'Wat controleren' },
    [['info', 'Informatie', open.length], ['series', 'Series', null]].map(([key, label, n]) => h('button', {
      type: 'button', role: 'tab', class: 'gb-check-tab', 'aria-selected': String(state.tab === key),
      onClick: () => { if (state.tab !== key) { state.tab = key; renderCheck(root, deps); } },
    }, label, n ? h('span', { class: 'gb-chip-n' }, String(n)) : null)));

  if (state.tab === 'series') {
    root.replaceChildren(h('div', { class: 'gb-check' },
      h('header', { class: 'gb-check-head' }, h('h2', { class: 'gb-check-title' }, 'Controle')),
      tabs,
      renderSeriesCheck({ ctx, all: deps.all, infoById: deps.infoById, refresh: redrawSeries })));
    return;
  }
  const inGroup = (r, grp) => r.issues.some((i) => i.group === grp);
  if (state.filter && !open.some((r) => inGroup(r, state.filter)) && !rows.some((r) => !r.issues.length)) state.filter = '';
  const shown = state.filter ? rows.filter((r) => !r.issues.length || inGroup(r, state.filter)) : rows;

  const chips = h('div', { class: 'gb-chips gb-check-chips', role: 'tablist', 'aria-label': 'Soort probleem' },
    [['', 'Alles'], ...ISSUE_GROUPS].map(([key, label]) => {
      const n = key ? open.filter((r) => inGroup(r, key)).length : open.length;
      return h('button', {
        type: 'button', role: 'tab', class: 'gb-chip', 'aria-selected': String(state.filter === key),
        disabled: Boolean(key) && !n && state.filter !== key,
        onClick: () => { state.filter = key; renderCheck(root, deps); },
      }, label, h('span', { class: 'gb-chip-n' }, String(n)));
    }));

  const list = shown.length
    ? h('ul', { class: 'gb-check-list' }, shown.map((r) => item(r.g, r.issues, deps)))
    : h('div', { class: 'card gb-check-empty' },
      h('p', { class: 'gb-check-empty-title' }, 'Niets om na te kijken'),
      h('p', {}, 'Alle games hebben een score, jaar, platform en boxart, en de gevonden pagina\'s lijken te kloppen.'));

  root.replaceChildren(h('div', { class: 'gb-check' },
    h('header', { class: 'gb-check-head' },
      h('h2', { class: 'gb-check-title' }, 'Controle'),
      h('p', { class: 'gb-check-intro' },
        open.length
          ? `${open.length} ${open.length === 1 ? 'game' : 'games'} met ontbrekende of onduidelijke informatie. Vul het hier aan, dan verdwijnt de game van deze lijst.`
          : 'Alles is compleet.'),
      deps.enrichNote),
    tabs,
    open.length || seen.size ? chips : null,
    list));

  if (focusKey) root.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function item(g, issues, deps) {
  const { ctx } = deps;
  const has = (k) => issues.some((i) => i.key === k);
  // Pas opslaan nadat de cursor (bij Tab) naar het volgende veld is gegaan:
  // opslaan tekent het scherm opnieuw, en dan zetten we de cursor daar terug.
  const save = (changes) => setTimeout(() => ctx.update((d) => { updateById(d.games, g.id, changes); }), 0);
  const blurOnEnter = (e) => { if (e.key === 'Enter') e.target.blur(); };

  const scoreField = h('label', { class: 'field gb-check-field' }, h('span', {}, 'Metascore'),
    h('input', {
      type: 'number', inputmode: 'numeric', min: 1, max: 100, step: 1, value: g.myScore || '',
      placeholder: '1–100', title: 'Metascore handmatig invullen', dataset: { focus: `${g.id}:score` },
      onChange: (e) => {
        const n = parseScore(e.target.value);
        if (e.target.value.trim() && !n) { ctx.toast('Vul een score van 1 tot en met 100 in.', 'error'); return; }
        if (n !== (g.myScore || 0)) save({ myScore: n });
      },
      onKeydown: blurOnEnter,
    }));

  const yearField = has('year') || has('version') ? h('label', { class: 'field gb-check-field' }, h('span', {}, 'Jaar'),
    h('input', {
      type: 'number', inputmode: 'numeric', min: 1970, max: 2100, step: 1,
      value: g.years?.length ? Math.min(...g.years) : '', placeholder: 'bv. 2021',
      dataset: { focus: `${g.id}:year` },
      onChange: (e) => {
        const n = Number(e.target.value);
        if (!e.target.value.trim()) return;
        if (!Number.isInteger(n) || n < 1970 || n > 2100) { ctx.toast('Vul een jaartal in, bijvoorbeeld 2021.', 'error'); return; }
        if (!(g.years?.length === 1 && g.years[0] === n)) save({ years: [n], noAutoYear: false });
      },
      onKeydown: blurOnEnter,
    })) : null;

  const platformField = has('platform') ? h('label', { class: 'field gb-check-field' }, h('span', {}, 'Platform'),
    h('select', {
      dataset: { focus: `${g.id}:platform` },
      onChange: (e) => { if (e.target.value) save({ platforms: [e.target.value] }); },
    }, h('option', { value: '' }, 'Kies…'), deps.platforms.map((p) => h('option', { value: p }, p)))) : null;

  const version = issues.find((i) => i.key === 'version');
  const done = !issues.length;

  return h('li', { class: 'card gb-check-item', dataset: { done: done ? 'yes' : null } },
    h('div', { class: 'gb-check-top' },
      h('button', {
        type: 'button', class: 'gb-check-name', onClick: () => deps.openDetail(g.id),
        title: 'Details bekijken',
      }, g.title),
      deps.scoreBadge(g)),
    h('div', { class: 'gb-check-tags' }, deps.tags(g)),
    h('div', { class: 'gb-check-issues' },
      done
        ? h('span', { class: 'gb-issue gb-issue-ok' }, '✓ Opgelost')
        : issues.map((i) => h('span', { class: 'gb-issue', dataset: { group: i.group } }, i.label))),
    issues.filter((i) => i.detail).map((i) => h('p', { class: 'gb-check-detail' }, i.detail)),
    done ? null : h('div', { class: 'gb-check-fields' }, scoreField, yearField, platformField),
    done ? null : h('div', { class: 'button-row gb-check-actions' },
      version ? h('button', {
        type: 'button', class: 'btn btn-small btn-ghost', dataset: { focus: `${g.id}:ok` },
        onClick: () => {
          const info = findById(ctx.data.gameInfo, g.id);
          if (info?.pageid) save({ confirmedPage: info.pageid });
        },
      }, 'Deze pagina klopt') : null,
      h('button', {
        type: 'button', class: 'btn btn-small btn-ghost',
        onClick: () => deps.openDetail(g.id, { picker: true }),
      }, 'Andere pagina kiezen')));
}
