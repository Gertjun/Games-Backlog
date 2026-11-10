// =============================================================
//  Controle → Series: welke games uit je series ontbreken nog?
// =============================================================
// Per serie in je lijst (alles behalve Overig) zoekt de app op Wikidata welke
// games bij die serie horen en laat zien welke daarvan nog niet in je lijst
// staan. Je hoeft de serie niet zelf op te zoeken:
//   1. Van de games in de serie is de Wikidata-pagina al bekend (opgehaald
//      voor score en boxart). Daar staat bij welke serie ze horen (P179).
//      De serie waar de meeste van jouw games bij horen telt, plus elke
//      andere serie waar er minstens twee bij horen (bij "Mario" bijvoorbeeld
//      Super Mario en Mario Kart).
//   2. Is van geen enkele game de pagina bekend, dan zoekt de app op de naam
//      van de serie (zoals bij Serie toevoegen).
// Of je een game al hebt, kijkt de app in je hele lijst (niet alleen in die
// serie): op de Wikidata-pagina en op titel, waarbij "Remastered", "HD",
// "3D", "DX", "Definitive Edition" en dergelijke niet meetellen, en een korte
// titel ("Majora's Mask 3D") ook telt voor de lange ("The Legend of Zelda:
// Majora's Mask").
//
// Resultaten staan alleen in het geheugen (deze sessie). Alleen
// Wikidata-nummers van games en de namen van je series gaan naar Wikidata.

import { h } from './core/dom.js';
import { alive, newRecord } from './core/records.js';
import { api, withTimeout, WIKIDATA } from './gameinfo.js';
import { searchSeries, loadSeriesGames, cleanSeriesName, sectionFor } from './series.js';
import { platformIcon, platformKey } from './platforms.js';
import { putInfo } from './enrich.js';

const NO_SERIES = 'Overig';
const P_SERIES = 'P179';
const WORKERS = 3;

/* ---------- Titels vergelijken ---------- */

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16 };
// Woorden achter een titel die geen andere game maken
const EDITION = new Set(['remastered', 'remaster', 'remake', 'hd', 'definitive', 'edition', 'deluxe', 'complete',
  'goty', 'game', 'year', 'directors', 'cut', 'anniversary', 'special', 'enhanced', 'collection', 'ultimate',
  'royal', 'golden', 'dx', 'plus', '3d', 'reloaded', 'gold', 'redux', 'classic', 'switch', 'version', 'of', 'the',
  'part', '1']);

export function titleKey(t) {
  return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ').replace(/'/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter(Boolean)
    .map((w) => String(ROMAN[w] ?? w))
    .filter((w, i) => !(i === 0 && w === 'the'))
    .join(' ');
}

/** Titel zonder toevoegingen aan het eind: "ocarina of time 3d" → "ocarina of time". */
function coreKey(k) {
  const w = k.split(' ');
  while (w.length > 1 && EDITION.has(w[w.length - 1])) w.pop();
  return w.join(' ');
}

/** Is `short` het eind van `long`, met een voorvoegsel dat de serienaam bevat? */
function endsWithTitle(long, short, groupKey) {
  if (!short || long === short || !long.endsWith(` ${short}`)) return long === short;
  const words = short.split(' ').length;
  if (words >= 3) return true;
  // Twee woorden ("majoras mask") alleen als het weggelaten stuk de serie
  // noemt ("legend of zelda"), anders is het te makkelijk een andere game.
  const prefix = ` ${long.slice(0, -short.length - 1)} `;
  return words === 2 && Boolean(groupKey) && groupKey.split(' ').every((w) => prefix.includes(` ${w} `));
}

/**
 * Staat deze Wikidata-game (in een of andere versie) al in je lijst?
 * `group`: de serie waarin gezocht wordt (bijvoorbeeld "Zelda").
 */
export function isOwned(wd, mine, group = '') {
  if (wd.qid && mine.qids.has(wd.qid)) return true;
  const k = titleKey(wd.title);
  if (!k) return false;
  if (mine.keys.has(k)) return true;
  const kc = coreKey(k);
  const gk = titleKey(group).replace(/^legend of /, '');
  for (const m of mine.keys) {
    const mc = coreKey(m);
    // Dezelfde game met een toevoeging: "… Remastered", "… HD", "… 3D", "… DX"
    if (mc === kc) return true;
    // Jouw titel is korter maar duidelijk dezelfde: "Ocarina of Time 3D" of
    // "Zelda Breath of the Wild" bij "The Legend of Zelda: …"
    if (endsWithTitle(kc, mc, gk) || endsWithTitle(k, m, gk)) return true;
  }
  return false;
}

/* ---------- Status van deze sessie ---------- */

const state = {
  running: false,
  ctrl: null,
  done: 0,
  total: 0,
  error: '',
  checkedAt: 0,
  results: new Map(), // serie in je lijst → { group, via: 'games'|'name', series: [{ qid, label }], games: [...] }
  notFound: [],
  onlyMine: true,
  picked: new Map(), // `${group}|${qid}` → Set(platforms)
};

/** Bij vergrendelen: alles vergeten en een lopende controle stoppen. */
export function clearSeriesCheck() {
  state.ctrl?.abort();
  Object.assign(state, { running: false, ctrl: null, done: 0, total: 0, error: '', checkedAt: 0, notFound: [] });
  state.results.clear();
  state.picked.clear();
}

/* ---------- Ophalen ---------- */

async function seriesOfGames(qids, signal) {
  const out = new Map(); // game-qid → [serie-qid]
  for (let i = 0; i < qids.length; i += 50) {
    const json = await api(WIKIDATA, { action: 'wbgetentities', ids: qids.slice(i, i + 50).join('|'), props: 'claims' }, signal);
    for (const [id, e] of Object.entries(json.entities || {})) {
      const list = (e?.claims?.[P_SERIES] || []).filter((c) => c.rank !== 'deprecated')
        .map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      out.set(id, list);
    }
  }
  return out;
}

async function labelsOf(qids, signal) {
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const json = await api(WIKIDATA, {
      action: 'wbgetentities', ids: qids.slice(i, i + 50).join('|'), props: 'labels', languages: 'en|nl',
    }, signal);
    for (const [id, e] of Object.entries(json.entities || {})) {
      out.set(id, cleanSeriesName(e?.labels?.en?.value || e?.labels?.nl?.value || id));
    }
  }
  return out;
}

/** Welke Wikidata-series horen bij elke serie in je lijst (op basis van je games)? */
function pickSeries(gameQids, seriesByGame) {
  const votes = new Map();
  for (const q of gameQids) for (const s of new Set(seriesByGame.get(q) || [])) votes.set(s, (votes.get(s) || 0) + 1);
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return [];
  return ranked.filter(([, n], i) => i === 0 || n >= 2).map(([q]) => q);
}

async function run(deps) {
  const { ctx } = deps;
  state.ctrl?.abort();
  const ctrl = new AbortController();
  Object.assign(state, { ctrl, running: true, done: 0, total: 0, error: '', notFound: [] });
  state.results.clear();
  state.picked.clear();
  const { signal } = ctrl;
  deps.refresh();

  try {
    const games = alive(ctx.data.games);
    const infos = new Map(alive(ctx.data.gameInfo || []).map((r) => [r.id, r]));
    const groups = new Map(); // serie → [wikidata-nummers van jouw games]
    for (const g of games) {
      const grp = g.group?.trim();
      if (!grp || grp === NO_SERIES) continue;
      if (!groups.has(grp)) groups.set(grp, []);
      const info = infos.get(g.id);
      if (info?.found && info.qid) groups.get(grp).push(info.qid);
    }
    state.total = groups.size;
    deps.refresh();

    const allQids = [...new Set([...groups.values()].flat())];
    const t = withTimeout(signal);
    let seriesByGame;
    try { seriesByGame = await seriesOfGames(allQids, t.signal); } finally { t.done(); }

    const plan = [...groups.entries()].map(([group, qids]) => ({ group, series: pickSeries(qids, seriesByGame) }));
    const allSeries = [...new Set(plan.flatMap((p) => p.series))];
    let labels = new Map();
    if (allSeries.length) {
      const t2 = withTimeout(signal);
      try { labels = await labelsOf(allSeries, t2.signal); } finally { t2.done(); }
    }

    const loaded = new Map(); // serie-qid → Promise<games>
    const load = (qid) => {
      if (!loaded.has(qid)) loaded.set(qid, loadSeriesGames(qid, signal));
      return loaded.get(qid);
    };

    const queue = plan.slice().sort((a, b) => a.group.localeCompare(b.group, 'nl'));
    const worker = async () => {
      while (queue.length && !signal.aborted) {
        const { group, series } = queue.shift();
        try {
          let via = 'games';
          let list = series.map((q) => ({ qid: q, label: labels.get(q) || q }));
          if (!list.length) {
            // Geen bekende pagina's: zoek op de naam van de serie
            via = 'name';
            const t3 = withTimeout(signal);
            try {
              const { results, onlySeries } = await searchSeries(group, t3.signal);
              if (onlySeries && results.length) list = [{ qid: results[0].qid, label: cleanSeriesName(results[0].label) }];
            } finally { t3.done(); }
          }
          if (!list.length) { state.notFound.push(group); continue; }
          const seen = new Set();
          const found = [];
          for (const s of list) {
            for (const wd of await load(s.qid)) {
              if (seen.has(wd.qid)) continue;
              seen.add(wd.qid);
              found.push(wd);
            }
          }
          if (!found.length) { state.notFound.push(group); continue; }
          found.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title));
          state.results.set(group, { group, via, series: list, games: found });
        } catch (err) {
          if (signal.aborted) return;
          state.notFound.push(group);
        } finally {
          if (!signal.aborted) { state.done += 1; deps.refresh(); }
        }
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));
    if (!signal.aborted) state.checkedAt = Date.now();
  } catch (err) {
    if (!signal.aborted) {
      state.error = navigator.onLine
        ? 'Wikidata is nu niet bereikbaar. Probeer het later nog eens.'
        : 'Je bent offline. De series controleren kan alleen met internet.';
    }
  } finally {
    if (state.ctrl === ctrl) { state.running = false; state.ctrl = null; }
    deps.refresh();
  }
}

function stop(deps) {
  state.ctrl?.abort();
  state.running = false;
  state.ctrl = null;
  deps.refresh();
}

/* ---------- Scherm ---------- */

const plural = (n, one, more) => `${n} ${n === 1 ? one : more}`;
const thisYear = () => new Date().getFullYear();

/**
 * Tekent het deel Series van Controle.
 * deps: { ctx, all (levende games), infoById, refresh() (tekent Controle opnieuw) }
 */
export function renderSeriesCheck(deps) {
  const { all, infoById } = deps;
  const mine = {
    qids: new Set(all.map((g) => infoById.get(g.id)).filter((i) => i?.found && i.qid).map((i) => i.qid)),
    keys: new Set(all.map((g) => titleKey(g.title)).filter(Boolean)),
  };
  const myPlatforms = new Set(all.flatMap((g) => g.platforms || []));
  const seriesCount = new Set(all.map((g) => g.group?.trim()).filter((s) => s && s !== NO_SERIES)).size;

  const fits = (wd) => !state.onlyMine || wd.options.some((p) => myPlatforms.has(p));
  const rows = [...state.results.values()]
    .map((r) => {
      const missing = r.games.filter((wd) => !isOwned(wd, mine, r.group));
      return { ...r, missing: missing.filter(fits), hidden: missing.length - missing.filter(fits).length };
    })
    .sort((a, b) => a.group.localeCompare(b.group, 'nl'));
  const withMissing = rows.filter((r) => r.missing.length);
  const complete = rows.filter((r) => !r.missing.length);
  const totalMissing = withMissing.reduce((n, r) => n + r.missing.length, 0);

  const hasRun = state.checkedAt || state.running || state.results.size;

  // Knoppen en voortgang. Breedte via JS: de CSP staat geen inline style-attribuut toe.
  const fill = h('span');
  fill.style.width = `${state.total ? Math.max(4, Math.round((state.done / state.total) * 100)) : 4}%`;
  const action = state.running
    ? h('div', { class: 'gb-sc-progress', role: 'status' },
      h('div', { class: 'gb-sc-bar', 'aria-hidden': 'true' },
        fill),
      h('span', {}, state.total ? `Series bekijken: ${state.done} van ${state.total}…` : 'Je series opzoeken…'),
      h('button', { type: 'button', class: 'btn btn-small', onClick: () => stop(deps) }, 'Stoppen'))
    : h('div', { class: 'button-row gb-sc-actions' },
      h('button', {
        type: 'button', class: hasRun ? 'btn' : 'btn btn-primary', disabled: !seriesCount,
        onClick: () => run(deps),
      }, hasRun ? 'Opnieuw controleren' : 'Series controleren'));

  const onlyMine = h('label', { class: 'gb-sc-toggle' },
    h('input', {
      type: 'checkbox', checked: state.onlyMine,
      onChange: (e) => { state.onlyMine = e.target.checked; deps.refresh(); },
    }),
    h('span', {}, 'Alleen games voor platforms die ik heb'));

  const summary = state.error
    ? h('p', { class: 'gb-sc-note' }, state.error)
    : !hasRun
      ? null
      : h('p', { class: 'gb-sc-note' }, state.running && !rows.length
        ? 'De eerste resultaten verschijnen zo.'
        : totalMissing
          ? `${plural(totalMissing, 'game ontbreekt', 'games ontbreken')} in ${plural(withMissing.length, 'serie', 'series')}.`
          : 'In de series die al bekeken zijn ontbreekt niets.');

  const intro = h('p', { class: 'gb-check-intro' }, seriesCount
    ? `Kijkt bij je ${plural(seriesCount, 'serie', 'series')} op Wikidata welke games er nog niet in je lijst staan. Je hoeft de series niet zelf op te zoeken.`
    : 'Je hebt nog geen games in een serie gezet. Games onder Overig worden niet bekeken.');

  return h('div', { class: 'gb-sc' },
    h('div', { class: 'card gb-sc-head' }, intro, action, hasRun ? onlyMine : null, summary),
    withMissing.length ? h('div', { class: 'gb-sc-list' }, withMissing.map((r) => seriesCard(r, deps, myPlatforms))) : null,
    complete.length ? h('section', { class: 'card gb-sc-rest' },
      h('h3', {}, `Compleet (${complete.length})`),
      h('p', {}, complete.map((r) => r.group).join(', ')),
      complete.some((r) => r.hidden) && state.onlyMine
        ? h('p', { class: 'muted' }, 'Bij sommige series zijn er nog games voor platforms die je niet hebt. Zet het vinkje hierboven uit om die te zien.')
        : null) : null,
    !state.running && state.notFound.length ? h('section', { class: 'card gb-sc-rest' },
      h('h3', {}, `Niet gevonden op Wikidata (${state.notFound.length})`),
      h('p', {}, state.notFound.slice().sort((a, b) => a.localeCompare(b, 'nl')).join(', ')),
      h('p', { class: 'muted' }, 'Bij deze series weet Wikidata niet welke games erbij horen, of de naam wijkt af. Via Serie toevoegen (bij +) kun je zelf zoeken.')) : null);
}

function seriesCard(r, deps, myPlatforms) {
  const { ctx } = deps;
  const keyOf = (wd) => `${r.group}|${wd.qid}`;
  const addBtn = h('button', { type: 'button', class: 'btn btn-primary btn-small' });
  const update = () => {
    const n = r.missing.filter((wd) => state.picked.has(keyOf(wd))).length;
    addBtn.textContent = n ? (n === 1 ? '1 game toevoegen' : `${n} games toevoegen`) : 'Toevoegen';
    addBtn.disabled = !n;
  };
  // Standaard op de kaart: het oorspronkelijke platform als je dat hebt,
  // anders het eerste platform dat je wel hebt.
  const defaultPlatforms = (wd) => {
    if (wd.platform && myPlatforms.has(wd.platform)) return [wd.platform];
    const mineFirst = wd.options.find((p) => myPlatforms.has(p));
    return mineFirst ? [mineFirst] : wd.platform ? [wd.platform] : [];
  };

  const items = r.missing.map((wd) => {
    const key = keyOf(wd);
    const chosen = () => state.picked.get(key);
    const box = h('input', {
      type: 'checkbox', checked: state.picked.has(key), 'aria-label': wd.title,
      onChange: () => {
        if (box.checked) state.picked.set(key, new Set(defaultPlatforms(wd)));
        else state.picked.delete(key);
        tags?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Boolean(chosen()?.has(b.dataset.name)))));
        update();
      },
    });
    const upcoming = wd.year && wd.year > thisYear();
    const tags = wd.options.length ? h('div', { class: 'gb-series-tags', role: 'group', 'aria-label': `Platforms van ${wd.title}` },
      wd.options.map((p) => {
        const tag = h('button', {
          type: 'button', class: 'gb-tag gb-ptag gb-series-ptag', dataset: { platform: platformKey(p), name: p },
          'aria-pressed': String(Boolean(chosen()?.has(p))),
          title: 'Tik om deze game met dit platform aan te vinken',
          onClick: () => {
            let set = chosen();
            if (!set) { set = new Set(); state.picked.set(key, set); box.checked = true; }
            if (set.has(p)) set.delete(p); else set.add(p);
            if (!set.size) { state.picked.delete(key); box.checked = false; }
            tag.setAttribute('aria-pressed', String(set.has(p)));
            update();
          },
        }, platformIcon(p), p);
        return tag;
      })) : null;
    return h('li', { class: 'gb-series-game' },
      h('label', { class: 'gb-series-check' }, box,
        h('span', { class: 'gb-series-gtitle' }, wd.title),
        h('span', { class: 'gb-series-gmeta muted' },
          wd.year ? (upcoming ? `verwacht ${wd.year}` : String(wd.year)) : 'jaar onbekend')),
      tags);
  });

  addBtn.addEventListener('click', async () => {
    const chosen = r.missing.filter((wd) => state.picked.has(keyOf(wd)));
    if (!chosen.length) return;
    await ctx.update((d) => {
      for (const wd of chosen) {
        const platforms = wd.options.filter((p) => state.picked.get(keyOf(wd)).has(p));
        const rec = newRecord({
          title: wd.title, section: sectionFor(platforms, wd.year || 0), group: r.group,
          platforms, years: wd.year ? [wd.year] : [], status: 'backlog',
          rating: 0, playedOn: '', finished: '', notes: '',
        });
        d.games.push(rec);
        // Score en boxart van precies deze Wikipedia-pagina
        if (wd.wiki) putInfo(d, rec.id, { query: '', pinned: false, found: false, fetchedAt: 0, want: wd.wiki });
      }
    });
    chosen.forEach((wd) => state.picked.delete(keyOf(wd)));
    ctx.toast(`${chosen.length === 1 ? '1 game' : `${chosen.length} games`} aan ${r.group} toegevoegd`, 'ok');
  });
  update();

  const source = r.series.map((s) => s.label).join(', ');
  const sourceText = r.via === 'name'
    ? `Op naam gevonden: ${source}.`
    : `Volgens Wikidata: ${source}.`;

  return h('section', { class: 'card gb-sc-card' },
    h('header', { class: 'gb-sc-card-head' },
      h('h3', {}, r.group),
      h('span', { class: 'gb-sc-count' }, `${r.missing.length} ${r.missing.length === 1 ? 'ontbreekt' : 'ontbreken'}`)),
    h('p', { class: 'gb-sc-source muted' }, sourceText),
    h('ul', { class: 'gb-series-games gb-sc-games' }, items),
    r.hidden && state.onlyMine
      ? h('p', { class: 'gb-sc-source muted' }, `Plus ${plural(r.hidden, 'game', 'games')} voor platforms die je niet hebt.`)
      : null,
    h('div', { class: 'button-row gb-sc-card-actions' }, addBtn));
}
