// =============================================================
//  Games Backlog — bijhouden welke games je hebt gespeeld
// =============================================================
// Datamodel (schema 1):
//   games: { id, createdAt, updatedAt, title, section ('modern'|'retro'),
//            group (serie/console-groep), platforms: string[],
//            status ('backlog'|'playing'|'done'|'dropped'),
//            rating (0–5), playedOn, finished ('yyyy-mm-dd'), notes }

import { h, today } from './core/dom.js';
import { newRecord, alive, findById, updateById, removeById, mergeCollections, purgeTombstones } from './core/records.js';
import { SEED } from './seed.js';

const SCHEMA = 1;
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
const view = { q: '', status: '', section: '', group: '', platform: '', sort: 'group' };

const collator = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' });
const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort(collator.compare);
const dateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = (s) => (s ? dateFmt.format(new Date(`${s}T12:00:00`)) : '');

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
    }));
    return { schema: SCHEMA, games };
  },

  migrate(data) {
    data.games ??= [];
    data.schema ??= SCHEMA;
    data.games = purgeTombstones(data.games, TOMBSTONE_DAYS);
    return data;
  },

  merge(local, remote) {
    return {
      ...remote,
      ...local,
      schema: Math.max(local.schema || 0, remote.schema || 0),
      games: mergeCollections(local.games, remote.games),
    };
  },

  render(root, ctx) {
    const all = alive(ctx.data.games);
    const listEl = h('div', { class: 'gb-list' });
    const chipsEl = h('div', { class: 'gb-chips', role: 'tablist', 'aria-label': 'Status' });

    const refresh = () => {
      renderChips(chipsEl, all, refresh);
      renderList(listEl, all, ctx);
    };

    const search = h('input', {
      type: 'search', value: view.q, placeholder: 'Zoek op titel, serie of platform…',
      'aria-label': 'Zoeken', autocomplete: 'off', class: 'gb-search',
      onInput: (e) => { view.q = e.target.value; refresh(); },
    });

    const select = (key, label, options) => h('select', {
      'aria-label': label,
      onChange: (e) => { view[key] = e.target.value; refresh(); },
    }, options.map(([value, text]) => h('option', { value, selected: view[key] === value }, text)));

    const filters = h('div', { class: 'gb-filters' },
      select('section', 'Categorie', [['', 'Alle systemen'], ['modern', 'Modern'], ['retro', 'Retro']]),
      select('group', 'Serie', [['', 'Alle series'], ...uniq(all.map((g) => g.group)).map((v) => [v, v])]),
      select('platform', 'Platform', [['', 'Alle platforms'], ...uniq(all.flatMap((g) => g.platforms)).map((v) => [v, v])]),
      select('sort', 'Sorteren', [['group', 'Per serie'], ['title', 'A–Z'], ['recent', 'Laatst gewijzigd'], ['rating', 'Beoordeling']]));

    const addBtn = h('button', {
      class: 'gb-fab', type: 'button', 'aria-label': 'Game toevoegen',
      onClick: () => openEditor(ctx, null),
    }, '+');

    root.replaceChildren(renderStats(all), search, chipsEl, filters, listEl, addBtn);
    refresh();
  },
};

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
    h('div', { class: 'gb-bar' }, bar));
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
    && (!q || [g.title, g.group, ...(g.platforms || []), g.playedOn, g.notes].join(' ').toLowerCase().includes(q)));
}

function sortGames(list) {
  const byTitle = (a, b) => collator.compare(a.title, b.title);
  const copy = [...list];
  if (view.sort === 'title') return copy.sort(byTitle);
  if (view.sort === 'recent') return copy.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (view.sort === 'rating') return copy.sort((a, b) => (b.rating || 0) - (a.rating || 0) || byTitle(a, b));
  // Per serie: modern eerst, binnen een serie de volgorde van de lijst
  return copy.sort((a, b) => (a.section === 'modern' ? 0 : 1) - (b.section === 'modern' ? 0 : 1));
}

function renderList(el, all, ctx) {
  const list = sortGames(filterGames(all, view));
  if (!list.length) {
    el.replaceChildren(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, all.length ? 'Geen games gevonden' : 'Nog geen games'),
      h('p', { class: 'muted' }, all.length ? 'Pas je zoekopdracht of filters aan.' : 'Tik op + om een game toe te voegen.')));
    return;
  }
  if (view.sort !== 'group') {
    el.replaceChildren(h('ul', { class: 'card gb-games' }, list.map((g) => gameRow(g, ctx))));
    return;
  }
  const groups = new Map();
  for (const g of list) {
    const key = `${SECTION[g.section] || 'Overig'} · ${g.group || 'Overig'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  }
  el.replaceChildren(...[...groups].map(([name, items]) => h('section', { class: 'gb-group' },
    h('h2', { class: 'gb-group-head' },
      h('span', {}, name),
      h('span', { class: 'gb-group-count' }, `${items.filter((g) => g.status === 'done').length}/${items.length}`)),
    h('ul', { class: 'card gb-games' }, items.map((g) => gameRow(g, ctx))))));
}

function gameRow(g, ctx) {
  const st = STATUS[g.status] || STATUS.backlog;
  const meta = [
    g.status === 'playing' || g.status === 'dropped' ? h('span', { class: `gb-tag gb-tag-${g.status}` }, st.label) : null,
    ...(g.platforms || []).map((p) => h('span', { class: 'gb-tag' }, p)),
    g.rating ? h('span', { class: 'gb-stars', 'aria-label': `${g.rating} sterren` }, '★'.repeat(g.rating)) : null,
    g.status === 'done' && g.finished ? h('span', { class: 'gb-date' }, formatDate(g.finished)) : null,
    g.notes ? h('span', { class: 'gb-tag', title: 'Heeft notities', 'aria-label': 'Heeft notities' }, '📝') : null,
  ];
  return h('li', { class: 'gb-game', dataset: { status: g.status } },
    h('button', {
      class: 'gb-status', type: 'button',
      'aria-label': `${g.title}: ${st.label}. Tik voor ${STATUS[NEXT[g.status] || 'playing'].label}`,
      onClick: () => cycleStatus(ctx, g),
    }, st.icon),
    h('button', { class: 'gb-body', type: 'button', onClick: () => openEditor(ctx, g.id) },
      h('span', { class: 'gb-title' }, g.title),
      h('span', { class: 'gb-meta' }, meta)));
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

/* ---------- Bewerken ---------- */

function openEditor(ctx, id) {
  const all = alive(ctx.data.games);
  const g = id ? findById(ctx.data.games, id) : {
    title: '', section: view.section || 'modern', group: view.group || '',
    platforms: view.platform ? [view.platform] : [], status: 'backlog',
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
          await ctx.update((d) => { removeById(d.games, id); });
          close();
          ctx.toast('Verwijderd');
        },
      }, 'Verwijderen') : null,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Opslaan')));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const data = {
      title: v.title.trim(),
      section: v.section,
      group: v.group.trim(),
      platforms: uniq(v.platforms.split(',').map((s) => s.trim())),
      status: v.status,
      playedOn: v.playedOn.trim(),
      finished: v.finished || (v.status === 'done' ? (g.finished || today()) : ''),
      rating,
      notes: v.notes.trim(),
    };
    if (!data.title) return;
    await ctx.update((d) => {
      if (id) updateById(d.games, id, data);
      else d.games.push(newRecord(data));
    });
    close();
    ctx.toast(id ? 'Opgeslagen' : `${data.title} toegevoegd`, 'ok');
  });

  const dlg = h('dialog', { class: 'sheet', 'aria-labelledby': 'gb-edit-title' },
    h('div', { class: 'sheet-header' },
      h('h2', { id: 'gb-edit-title' }, id ? 'Game bewerken' : 'Game toevoegen'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sluiten', onClick: () => close() }, '✕')),
    h('div', { class: 'sheet-body' }, form));
  function close() { dlg.close(); }
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (!id) form.elements.title.focus();
}
