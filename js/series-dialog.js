// =============================================================
//  Hele serie toevoegen
// =============================================================
// 1. Zoek een serie (bijvoorbeeld "Professor Layton").
// 2. Je ziet alle games uit die serie, oudste eerst. Vink aan wat je wilt,
//    tik op de platformlabels om te kiezen welke op de kaart komen, en pas
//    eventueel de naam van de serie aan.
// 3. Toevoegen: elke game krijgt een eigen kaart met status Backlog. Score en
//    boxart worden daarna van de juiste Wikipedia-pagina opgehaald.

import { h } from './core/dom.js';
import { alive, newRecord } from './core/records.js';
import { platformIcon, platformKey } from './platforms.js';
import { putInfo } from './enrich.js';
import { searchSeries, loadSeriesGames, cleanSeriesName, sectionFor } from './series.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\([^)]*\)/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Bestaande serienaam gebruiken als die er duidelijk mee overeenkomt ("Zelda" bij "The Legend of Zelda"). */
function matchGroup(name, groups) {
  const n = norm(name);
  return groups.find((g) => norm(g) === n)
    || groups.find((g) => norm(g).length >= 4 && (` ${n} `).includes(` ${norm(g)} `))
    || name;
}

export function openSeriesImport(ctx, { onDone } = {}) {
  document.querySelector('dialog.gb-series')?.close();
  let ctrl = null; // lopende zoekopdracht, wordt afgebroken bij een nieuwe
  const abort = () => { ctrl?.abort(); ctrl = new AbortController(); return ctrl.signal; };

  const body = h('div', { class: 'sheet-body gb-series-body' });
  const title = h('h2', { id: 'gb-series-title' }, 'Serie toevoegen');
  const dlg = h('dialog', { class: 'sheet gb-modal gb-series', 'aria-labelledby': 'gb-series-title' },
    h('div', { class: 'sheet-header' }, title,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sluiten', onClick: () => dlg.close() }, '✕')),
    body);
  dlg.addEventListener('close', () => { ctrl?.abort(); dlg.remove(); });
  document.body.append(dlg);
  dlg.showModal();
  showSearch();

  /* ---------- Stap 1: serie zoeken ---------- */
  // autoOpen: bij precies één gevonden serie meteen de games tonen. Niet als je
  // via Terug komt, anders spring je direct weer vooruit.
  function showSearch(initial = '', autoOpen = true) {
    title.textContent = 'Serie toevoegen';
    const input = h('input', {
      type: 'search', name: 'q', value: initial, required: true, autocomplete: 'off', enterkeyhint: 'search',
      placeholder: 'bv. Professor Layton', 'aria-label': 'Naam van de serie',
    });
    const results = h('div', { class: 'gb-series-results', 'aria-live': 'polite' });
    const form = h('form', { class: 'gb-series-search' }, input,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Zoeken'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      const signal = abort();
      results.replaceChildren(h('p', { class: 'muted' }, 'Zoeken…'));
      try {
        const { results: list, onlySeries } = await searchSeries(q, signal);
        if (signal.aborted) return;
        if (autoOpen && onlySeries && list.length === 1) { showGames(list[0], q); return; }
        autoOpen = true;
        const hint = list.length ? h('p', { class: 'muted gb-series-hint' }, onlySeries
          ? 'Tik op een serie om de games te zien en te kiezen.'
          : 'Geen serie gevonden met die naam. Deze resultaten komen het dichtst in de buurt.') : null;
        results.replaceChildren(...[hint, list.length
          ? h('ul', { class: 'card gb-series-list' }, list.map((r) => h('li', {},
            h('button', { type: 'button', class: 'gb-series-pick', onClick: () => showGames(r, q) },
              h('span', { class: 'gb-series-name' }, r.label),
              r.description ? h('span', { class: 'gb-series-desc muted' }, r.description) : null))))
          : h('p', { class: 'muted' }, `Niets gevonden voor "${q}". Probeer de Engelse naam van de serie.`)].filter(Boolean));
      } catch (err) {
        if (signal.aborted) return;
        results.replaceChildren(h('p', { class: 'muted' }, offlineText()));
      }
    });
    body.replaceChildren(
      h('p', { class: 'muted gb-series-intro' }, 'Zoek een serie en kies welke games je in één keer aan je lijst toevoegt.'),
      form, results);
    input.focus();
    if (initial) form.requestSubmit();
  }

  /* ---------- Stap 2: games kiezen ---------- */
  async function showGames(series, query) {
    const signal = abort();
    title.textContent = cleanSeriesName(series.label);
    body.replaceChildren(h('p', { class: 'muted' }, 'Games uit deze serie ophalen…'));
    let games;
    try {
      games = await loadSeriesGames(series.qid, signal);
    } catch {
      if (signal.aborted) return;
      body.replaceChildren(h('p', { class: 'muted' }, offlineText()), backButton(query));
      return;
    }
    if (signal.aborted) return;
    if (!games.length) {
      body.replaceChildren(
        h('p', { class: 'muted' }, 'Bij deze serie staan op Wikidata geen games. Kies een ander zoekresultaat.'),
        backButton(query));
      return;
    }

    const mine = alive(ctx.data.games);
    const have = new Set(mine.map((g) => norm(g.title)));
    const groups = [...new Set(mine.map((g) => g.group?.trim()).filter(Boolean))];
    const rows = games.map((g) => ({
      ...g, owned: have.has(norm(g.title)), on: !have.has(norm(g.title)),
      platforms: new Set(g.platform ? [g.platform] : []),
    }));

    const nameInput = h('input', {
      type: 'text', value: matchGroup(cleanSeriesName(series.label), groups), required: true,
      autocomplete: 'off', list: 'gb-series-groups',
    });
    const addBtn = h('button', { type: 'submit', class: 'btn btn-primary' });
    const updateCount = () => {
      const n = rows.filter((r) => r.on).length;
      addBtn.textContent = n === 1 ? '1 game toevoegen' : `${n} games toevoegen`;
      addBtn.disabled = !n;
    };
    const list = h('ul', { class: 'card gb-series-games' }, rows.map((r) => {
      const box = h('input', {
        type: 'checkbox', checked: r.on, 'aria-label': r.title,
        onChange: () => { r.on = box.checked; updateCount(); },
      });
      // Platformlabels: alle platforms waarop de game is verschenen. Tik om te
      // kiezen welke op de kaart komen; het oorspronkelijke platform staat aan.
      const tags = r.options.length ? h('div', { class: 'gb-series-tags', role: 'group', 'aria-label': `Platforms van ${r.title}` },
        r.options.map((p) => {
          const tag = h('button', {
            type: 'button', class: 'gb-tag gb-ptag gb-series-ptag', dataset: { platform: platformKey(p) },
            'aria-pressed': String(r.platforms.has(p)),
            title: r.options.length > 1 ? 'Tik om dit platform op de kaart te zetten of weg te halen' : null,
            onClick: () => {
              if (r.platforms.has(p)) r.platforms.delete(p); else r.platforms.add(p);
              tag.setAttribute('aria-pressed', String(r.platforms.has(p)));
            },
          }, platformIcon(p), p);
          return tag;
        })) : null;
      return h('li', { class: 'gb-series-game' },
        h('label', { class: 'gb-series-check' }, box,
          h('span', { class: 'gb-series-gtitle' }, r.title),
          h('span', { class: 'gb-series-gmeta muted' },
            r.year ? String(r.year) : 'jaar onbekend',
            r.owned ? ' · staat al in je lijst' : '')),
        tags);
    }));
    const setAll = (on) => {
      rows.forEach((r) => { r.on = on; });
      list.querySelectorAll('input[type=checkbox]').forEach((b) => { b.checked = on; });
      updateCount();
    };

    const form = h('form', { class: 'stack gb-series-form' },
      h('label', { class: 'field' }, h('span', {}, 'Naam van de serie in je lijst'), nameInput),
      h('datalist', { id: 'gb-series-groups' }, groups.map((g) => h('option', { value: g }))),
      h('div', { class: 'gb-series-bar' },
        h('span', { class: 'muted' }, `${rows.length} games gevonden`),
        h('span', { class: 'gb-series-all' },
          h('button', { type: 'button', class: 'btn btn-small', onClick: () => setAll(true) }, 'Alles'),
          h('button', { type: 'button', class: 'btn btn-small', onClick: () => setAll(false) }, 'Niets'))),
      list,
      h('p', { class: 'muted gb-form-hint' }, 'Platform en jaar komen van Wikidata. Tik op een platform om het op de kaart te zetten of weg te halen; gekleurd = komt op de kaart.'),
      h('div', { class: 'button-row gb-form-actions' },
        h('button', { type: 'button', class: 'btn', onClick: () => showSearch(query, false) }, 'Terug'),
        addBtn));
    updateCount();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const group = nameInput.value.trim();
      const chosen = rows.filter((r) => r.on);
      if (!group || !chosen.length) return;
      await ctx.update((d) => {
        for (const r of chosen) {
          const platforms = r.options.filter((p) => r.platforms.has(p));
          const rec = newRecord({
            title: r.title, section: sectionFor(platforms, r.year || 0), group,
            platforms, years: r.year ? [r.year] : [], status: 'backlog',
            rating: 0, playedOn: '', finished: '', notes: '',
          });
          d.games.push(rec);
          // Score en boxart van precies deze Wikipedia-pagina
          if (r.wiki) putInfo(d, rec.id, { query: '', pinned: false, found: false, fetchedAt: 0, want: r.wiki });
        }
      });
      dlg.close();
      ctx.toast(`${chosen.length === 1 ? '1 game' : `${chosen.length} games`} van ${group} toegevoegd`, 'ok');
      onDone?.(group);
    });
    body.replaceChildren(form);
  }

  function backButton(query) {
    return h('div', { class: 'button-row' }, h('button', { type: 'button', class: 'btn', onClick: () => showSearch(query, false) }, 'Terug'));
  }
}

const offlineText = () => (navigator.onLine
  ? 'Wikidata is nu niet bereikbaar. Probeer het later nog eens.'
  : 'Je bent offline. Een serie zoeken kan alleen met internet.');
