// =============================================================
//  Analyse: hoe staat je backlog ervoor?
// =============================================================
// Een apart scherm naast Overzicht, Controle en Instellingen, met:
//   - Voortgang: uitgespeeld van het totaal, en de verdeling over de statussen;
//   - Uitgespeeld per jaar (op de datum "Uitgespeeld op");
//   - Per platform en per serie: hoeveel games je hebt en hoeveel daarvan
//     uitgespeeld. De lengte van de balk is het aantal games, het gekleurde
//     deel het aantal uitgespeeld;
//   - Modern en retro;
//   - Scores: gemiddelde Metascore, je gemiddelde beoordeling (1–100), hoeveel
//     die afwijkt van de Metascore, en de hoogst scorende games in je backlog.
// Tik op een platform, serie, status of categorie en je gaat naar Overzicht
// met dat filter aan. Dit bestand wijzigt geen gegevens.

import { h } from './core/dom.js';

const SERIES_SHOWN = 10; // daarna "Toon alle series"
let allSeries = false; // onthouden zolang de app open is

/**
 * deps: { all, status (sleutel → { label }), noSeries, scoreOf(g) → getal of null,
 *         scoreBadge(g), platformIcon(p), platformKey(p), platformRank(p),
 *         jump(filter), openDetail(id), enrichNote, compare(a, b) }
 */
export function renderAnalysis(root, deps) {
  const { all } = deps;
  const body = all.length
    ? h('div', { class: 'gb-an-body' }, progressCard(deps), h('div', { class: 'gb-an-grid' },
      yearCard(deps), platformCard(deps), seriesCard(root, deps), sectionCard(deps), scoreCard(deps)))
    : h('div', { class: 'card gb-check-empty' },
      h('p', { class: 'gb-check-empty-title' }, 'Nog geen games'),
      h('p', {}, 'Voeg games toe op Overzicht, dan zie je hier hoe je backlog ervoor staat.'));

  root.replaceChildren(h('div', { class: 'gb-an' },
    h('header', { class: 'gb-check-head' },
      h('h2', { class: 'gb-check-title gb-an-title' }, 'Analyse'),
      deps.enrichNote),
    body));
}

/* ---------- Bouwstenen ---------- */

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const games = (n) => `${n} ${n === 1 ? 'game' : 'games'}`;

function card(title, ...content) {
  return h('section', { class: 'card gb-an-card', 'aria-label': title },
    h('h3', { class: 'gb-an-head' }, title), ...content);
}

/**
 * Eén regel met een balk. De lengte van de balk is `total` ten opzichte van
 * `max`; het gekleurde deel is `done`. Met onClick wordt het een knop.
 */
function barRow({ label, icon, done, total, max, platform, onClick, title }) {
  const track = h('span', { class: 'gb-an-track' });
  const fill = h('span', { class: 'gb-an-fill' });
  // Breedtes via JS: de CSP staat geen inline style-attribuut toe
  track.style.width = `${Math.max(4, (total / max) * 100)}%`;
  fill.style.width = `${pct(done, total)}%`;
  track.append(fill);
  const content = [
    h('span', { class: 'gb-an-label' }, icon, h('span', { class: 'gb-an-name' }, label)),
    h('span', { class: 'gb-an-bar' }, track),
    h('span', { class: 'gb-an-n' }, h('strong', {}, String(done)), ` / ${total}`),
  ];
  const attrs = {
    class: 'gb-an-row', dataset: platform ? { platform } : {},
    'aria-label': title ?? `${label}: ${done} van ${games(total)} uitgespeeld`,
  };
  return onClick
    ? h('button', { ...attrs, type: 'button', onClick }, content)
    : h('div', { ...attrs, role: 'group' }, content);
}

function legendNote() {
  return h('p', { class: 'gb-an-note' },
    h('span', { class: 'gb-an-key' }), 'uitgespeeld, de hele balk is het aantal games. Tik voor de games in Overzicht.');
}

/* ---------- Voortgang ---------- */

const STATUS_ORDER = ['done', 'playing', 'backlog', 'dropped'];

function progressCard({ all, status, jump }) {
  const count = Object.fromEntries(STATUS_ORDER.map((s) => [s, all.filter((g) => g.status === s).length]));
  const done = count.done;

  const stack = h('div', { class: 'gb-an-stack', role: 'img',
    'aria-label': STATUS_ORDER.map((s) => `${status[s].label} ${count[s]}`).join(', ') });
  for (const s of STATUS_ORDER) {
    if (!count[s]) continue;
    const seg = h('span', { class: 'gb-an-seg', dataset: { status: s } });
    seg.style.width = `${(count[s] / all.length) * 100}%`;
    stack.append(seg);
  }

  const legend = h('div', { class: 'gb-an-legend' }, STATUS_ORDER.map((s) => h('button', {
    type: 'button', class: 'gb-an-chip', dataset: { status: s },
    'aria-label': `${status[s].label}: ${games(count[s])}, toon in Overzicht`,
    onClick: () => jump({ status: s }),
  }, h('span', { class: 'gb-an-dot' }), status[s].label, h('strong', {}, String(count[s])))));

  return h('section', { class: 'card gb-an-card gb-an-progress', 'aria-label': 'Voortgang' },
    h('h3', { class: 'gb-an-head' }, 'Voortgang'),
    h('p', { class: 'gb-an-big' },
      h('strong', {}, String(done)), h('span', {}, ` van ${games(all.length)} uitgespeeld`),
      h('span', { class: 'gb-an-pct' }, `${pct(done, all.length)}%`)),
    stack, legend);
}

/* ---------- Uitgespeeld per jaar ---------- */

function yearCard({ all }) {
  const done = all.filter((g) => g.status === 'done');
  const byYear = new Map();
  for (const g of done) {
    const y = /^\d{4}/.test(g.finished || '') ? Number(g.finished.slice(0, 4)) : null;
    if (y) byYear.set(y, (byYear.get(y) || 0) + 1);
  }
  const noDate = done.length - [...byYear.values()].reduce((a, b) => a + b, 0);
  if (!byYear.size) {
    return card('Uitgespeeld per jaar', h('p', { class: 'gb-an-empty' },
      done.length
        ? 'Nog geen datums. Vul bij een uitgespeelde game "Uitgespeeld op" in, dan verschijnt hij hier.'
        : 'Nog niets uitgespeeld. Zet je een game op Uitgespeeld, dan komt de datum er vanzelf bij.'));
  }
  const max = Math.max(...byYear.values());
  const rows = [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([y, n]) => {
    const fill = h('span', { class: 'gb-an-fill' });
    fill.style.width = `${Math.max(4, (n / max) * 100)}%`;
    return h('div', { class: 'gb-an-row gb-an-year', role: 'group', 'aria-label': `${y}: ${games(n)} uitgespeeld` },
      h('span', { class: 'gb-an-label' }, h('span', { class: 'gb-an-name' }, String(y))),
      h('span', { class: 'gb-an-bar' }, h('span', { class: 'gb-an-track is-solid' }, fill)),
      h('span', { class: 'gb-an-n' }, h('strong', {}, String(n))));
  });
  return card('Uitgespeeld per jaar', h('div', { class: 'gb-an-rows' }, rows),
    noDate ? h('p', { class: 'gb-an-note' }, `${games(noDate)} uitgespeeld zonder datum.`) : null);
}

/* ---------- Per platform ---------- */

function platformCard({ all, platformIcon, platformKey, platformRank, jump, compare }) {
  const stats = new Map();
  let none = { done: 0, total: 0 };
  for (const g of all) {
    const list = g.platforms?.length ? g.platforms : null;
    for (const p of list || [null]) {
      const s = p ? (stats.get(p) || stats.set(p, { done: 0, total: 0 }).get(p)) : none;
      s.total += 1;
      if (g.status === 'done') s.done += 1;
    }
  }
  if (!stats.size && !none.total) return null;
  const entries = [...stats.entries()].sort((a, b) => platformRank(a[0]) - platformRank(b[0]) || compare(a[0], b[0]));
  const max = Math.max(...entries.map(([, s]) => s.total), none.total);
  const rows = entries.map(([p, s]) => barRow({
    label: p, icon: platformIcon(p), ...s, max, platform: platformKey(p),
    onClick: () => jump({ platform: p }),
  }));
  if (none.total) rows.push(barRow({ label: 'Geen platform', ...none, max }));
  return card('Per platform', h('div', { class: 'gb-an-rows' }, rows),
    h('p', { class: 'gb-an-note' }, 'Een game op meer platforms telt bij elk platform mee.'));
}

/* ---------- Per serie ---------- */

function seriesCard(root, deps) {
  const { all, noSeries, jump, compare } = deps;
  const stats = new Map();
  for (const g of all) {
    const name = g.group?.trim() || noSeries;
    const s = stats.get(name) || stats.set(name, { done: 0, total: 0 }).get(name);
    s.total += 1;
    if (g.status === 'done') s.done += 1;
  }
  // Grootste series eerst; Overig (losse games) altijd onderaan.
  const entries = [...stats.entries()]
    .sort((a, b) => (a[0] === noSeries) - (b[0] === noSeries) || b[1].total - a[1].total || compare(a[0], b[0]));
  const real = entries.filter(([n]) => n !== noSeries);
  const shown = allSeries ? entries : [...real.slice(0, SERIES_SHOWN), ...entries.filter(([n]) => n === noSeries)];
  const max = Math.max(...entries.map(([, s]) => s.total));
  const rows = shown.map(([name, s]) => barRow({ label: name, ...s, max, onClick: () => jump({ group: name }) }));

  const complete = real.filter(([, s]) => s.done === s.total).length;
  const more = real.length > SERIES_SHOWN
    ? h('button', {
      type: 'button', class: 'btn gb-an-more',
      onClick: () => { allSeries = !allSeries; renderAnalysis(root, deps); },
    }, allSeries ? 'Toon minder' : `Toon alle ${real.length} series`)
    : null;

  return card('Per serie',
    h('p', { class: 'gb-an-sub' },
      `${real.length} ${real.length === 1 ? 'serie' : 'series'}`,
      complete ? `, waarvan ${complete} helemaal uitgespeeld` : ''),
    h('div', { class: 'gb-an-rows' }, rows), more, legendNote());
}

/* ---------- Modern en retro ---------- */

function sectionCard({ all, jump }) {
  const sections = [['modern', 'Modern'], ['retro', 'Retro']].map(([key, label]) => {
    const list = all.filter((g) => g.section === key);
    return { key, label, total: list.length, done: list.filter((g) => g.status === 'done').length };
  }).filter((s) => s.total);
  if (!sections.length) return null;
  const max = Math.max(...sections.map((s) => s.total));
  return card('Modern en retro', h('div', { class: 'gb-an-rows' },
    sections.map((s) => barRow({ label: s.label, done: s.done, total: s.total, max, onClick: () => jump({ section: s.key }) }))),
  h('p', { class: 'gb-an-note' },
    sections.map((s) => `${s.label}: ${pct(s.done, s.total)}% uitgespeeld`).join(' · ')));
}

/* ---------- Scores ---------- */

function scoreCard({ all, scoreOf, scoreBadge, openDetail, compare }) {
  const avg = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null);
  const scored = all.map((g) => [g, scoreOf(g)]).filter(([, s]) => s);
  const doneScores = scored.filter(([g]) => g.status === 'done').map(([, s]) => s);
  const rated = all.filter((g) => g.rating > 0);
  // Verschil met de Metascore: alleen games met allebei een score
  const diffs = rated.map((g) => [g.rating, scoreOf(g)]).filter(([, s]) => s).map(([r, s]) => r - s);
  const diff = avg(diffs);
  const signed = (n) => (n == null ? null : n === 0 ? '0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`);

  const tile = (value, label) => h('div', { class: 'gb-an-tile' },
    h('strong', {}, value ?? '–'), h('span', {}, label));

  const top = scored.filter(([g]) => g.status === 'backlog')
    .sort((a, b) => b[1] - a[1] || compare(a[0].title, b[0].title)).slice(0, 5);

  return card('Scores',
    h('div', { class: 'gb-an-tiles' },
      tile(avg(scored.map(([, s]) => s)), `gemiddelde score (${scored.length} games)`),
      tile(avg(doneScores), 'gemiddeld van wat je uitspeelde'),
      tile(avg(rated.map((g) => g.rating)), `jouw gemiddelde beoordeling (${rated.length} games)`),
      tile(signed(diff), diffs.length
        ? `jij t.o.v. de Metascore (${diffs.length} games)` : 'jij t.o.v. de Metascore')),
    top.length
      ? h('div', { class: 'gb-an-top' },
        h('h4', { class: 'gb-an-subhead' }, 'Hoogst scorend in je backlog'),
        h('ol', { class: 'gb-an-toplist' }, top.map(([g]) => h('li', {},
          h('button', { type: 'button', class: 'gb-an-topbtn', onClick: () => openDetail(g.id) },
            h('span', { class: 'gb-an-toptitle' }, g.title),
            (g.platforms || []).length ? h('span', { class: 'gb-an-topmeta' }, g.platforms.join(', ')) : null,
            scoreBadge(g))))))
      : null);
}
