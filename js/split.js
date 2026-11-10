// =============================================================
//  Splitsen: één kaart met meerdere platforms → losse, gekoppelde kaarten
// =============================================================
// Vanuit Controle ("Meerdere platforms op één kaart"). Je ziet per platform
// een voorstel: titel en jaar, en of het een nieuwe kaart wordt of een
// koppeling met een game die al in je lijst staat (bijvoorbeeld
// "Ocarina of Time 3D" op de 3DS). Vink je een platform uit, dan gaat het
// alleen van de kaart af.
//
// De eerste aangevinkte versie blijft de bestaande kaart, met je status,
// beoordeling, notities en de al opgehaalde score en boxart. De andere
// versies krijgen een eigen kaart met status Backlog, in dezelfde serie;
// score en boxart worden daarna opgehaald. Alle versies delen een sleutel
// in `links` (zie versions.js), net als bij Versie toevoegen.

import { h } from './core/dom.js';
import { alive, findById, newRecord, updateById } from './core/records.js';
import { platformIcon, platformKey, platformRank } from './platforms.js';
import { relatedIndex, linkKey } from './versions.js';
import { sectionFor } from './series.js';
import { titleWords } from './check.js';

// Woorden die een versie aanduiden, niet een andere game
const EDITION = new Set(['3d', 'dx', 'hd', 'deluxe', 'remake', 'definitive', 'edition', 'collection',
  'master', 'quest', 'collector', 'collectors', 'anniversary', 'director', 'directors', 'cut', 'complete']);

function coreWords(title, group) {
  const skip = new Set(titleWords(group));
  return titleWords(title).filter((w) => !EDITION.has(w) && !skip.has(w) && !/^\d{4}$/.test(w));
}

/** Gaat het om dezelfde game? Alle kernwoorden van de kortste titel staan in de langste. */
function sameGame(a, b, group) {
  const wa = coreWords(a, group);
  const wb = coreWords(b, group);
  const [short, long] = wa.length <= wb.length ? [wa, new Set(wb)] : [wb, new Set(wa)];
  if (!short.length || (short.length < 2 && long.size > short.length)) return false;
  return short.every((w) => long.has(w));
}

/** Startvoorstel: één regel per versie, oudste platform eerst. */
export function proposeSplit(g, all) {
  const platforms = [...(g.platforms || [])];
  const years = [...(g.years || [])].sort((a, b) => a - b);
  const segments = String(g.title).split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);

  let rows;
  if (segments.length > 1 && segments.length === platforms.length) {
    // "Titel A/Titel B" met evenveel platforms: in die volgorde
    rows = segments.map((title, i) => ({
      title, platform: platforms[i], year: years.length === platforms.length ? years[i] : (i === 0 ? years[0] : null),
    }));
  } else {
    const sorted = platforms.slice().sort((a, b) => platformRank(a) - platformRank(b));
    const title = segments.length > 1 ? segments[0] : g.title;
    rows = sorted.map((platform, i) => ({
      title, platform, year: years.length === sorted.length ? years[i] : (i === 0 ? years[0] : null),
    }));
  }

  // Bestaat deze versie al als eigen kaart? Dan koppelen in plaats van een nieuwe kaart.
  const related = new Set((relatedIndex(all).get(g.id) || []).map((o) => o.id));
  for (const r of rows) {
    const hit = all.find((o) => o.id !== g.id && (o.platforms || []).includes(r.platform)
      && (sameGame(r.title, o.title, g.group) || sameGame(g.title, o.title, g.group)));
    r.existing = hit || null;
    r.alreadyLinked = Boolean(hit && related.has(hit.id));
    r.keep = true;
  }
  return rows;
}

/** Voert het voorstel uit (muteert `d`). Geeft het aantal nieuwe en gekoppelde kaarten terug. */
export function applySplit(d, id, rows) {
  const g = findById(d.games, id);
  const keep = rows.filter((r) => r.keep);
  if (!g || !keep.length) return null;
  const [first, ...rest] = keep;
  const needLink = rest.length > 0;
  const key = linkKey({}, g);
  const now = Date.now();

  updateById(d.games, g.id, {
    title: first.title, platforms: [first.platform], years: first.year ? [first.year] : [],
    noAutoYear: false,
    ...(needLink && !(g.links || []).includes(key) ? { links: [...(g.links || []), key] } : {}),
  });

  let created = 0;
  let linked = 0;
  const extra = [];
  for (const r of rest) {
    if (r.existing && r.useExisting) {
      const o = findById(d.games, r.existing.id);
      if (o && !(o.links || []).includes(key)) updateById(d.games, o.id, { links: [...(o.links || []), key] });
      linked += 1;
      continue;
    }
    extra.push(newRecord({
      title: r.title, section: sectionFor([r.platform], r.year || 0),
      group: g.group || '', platforms: [r.platform], years: r.year ? [r.year] : [],
      status: 'backlog', rating: 0, playedOn: '', finished: '', notes: '', links: [key],
      createdAt: now, updatedAt: now,
    }));
    created += 1;
  }
  d.games.splice(d.games.indexOf(g) + 1, 0, ...extra);
  return { created, linked };
}

/** Het venster met het voorstel. */
export function openSplit(ctx, id) {
  document.querySelector('dialog.gb-split')?.close();
  const all = alive(ctx.data.games);
  const g = findById(ctx.data.games, id);
  if (!g) return;
  const rows = proposeSplit(g, all);
  for (const r of rows) r.useExisting = Boolean(r.existing);

  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Splitsen');
  const summary = h('p', { class: 'gb-split-summary muted', 'aria-live': 'polite' });

  const update = () => {
    const keep = rows.filter((r) => r.keep);
    const rest = keep.slice(1);
    const made = rest.filter((r) => !(r.existing && r.useExisting)).length;
    const link = rest.length - made;
    const dropped = rows.length - keep.length;
    rowsEl.querySelectorAll('.gb-split-row').forEach((el, i) => {
      el.dataset.keep = rows[i].keep ? 'yes' : 'no';
      el.dataset.first = rows[i] === keep[0] ? 'yes' : 'no';
    });
    submit.disabled = !keep.length;
    summary.textContent = !keep.length
      ? 'Laat minstens één platform aangevinkt.'
      : [
        `Deze kaart wordt ${keep[0].title} (${keep[0].platform})`,
        made ? `${made} nieuwe ${made === 1 ? 'kaart' : 'kaarten'}` : '',
        link ? `${link} ${link === 1 ? 'koppeling' : 'koppelingen'} met een bestaande kaart` : '',
        dropped ? `${dropped} ${dropped === 1 ? 'platform gaat' : 'platforms gaan'} van de kaart af` : '',
      ].filter(Boolean).join(' · ') + '.';
  };

  const rowsEl = h('ol', { class: 'gb-split-rows' }, rows.map((r, i) => {
    const fid = `gb-split-${i}`;
    const title = h('input', {
      type: 'text', id: `${fid}-t`, value: r.title, required: true, autocomplete: 'off',
      onInput: (e) => { r.title = e.target.value.trim(); update(); },
    });
    const year = h('input', {
      type: 'number', id: `${fid}-y`, inputmode: 'numeric', min: 1970, max: 2100, step: 1,
      value: r.year || '', placeholder: 'bv. 1998',
      onInput: (e) => { const n = Number(e.target.value); r.year = Number.isInteger(n) && n >= 1970 && n <= 2100 ? n : null; },
    });
    const fields = h('div', { class: 'gb-split-fields' },
      h('label', { class: 'field', for: `${fid}-t` }, h('span', {}, 'Titel'), title),
      h('label', { class: 'field gb-split-year', for: `${fid}-y` }, h('span', {}, 'Jaar'), year));
    const setMode = () => { fields.hidden = Boolean(r.existing && r.useExisting); };
    setMode();
    const choice = r.existing ? h('label', { class: 'field gb-split-choice' }, h('span', {}, 'Staat al in je lijst'),
      h('select', {
        onChange: (e) => { r.useExisting = e.target.value === 'link'; setMode(); update(); },
      },
      h('option', { value: 'link', selected: true },
        `${r.alreadyLinked ? 'Al gekoppeld' : 'Koppelen aan'}: ${r.existing.title}`),
      h('option', { value: 'new' }, 'Toch een nieuwe kaart maken'))) : null;

    return h('li', { class: 'gb-split-row card' },
      h('div', { class: 'gb-split-head' },
        h('label', { class: 'gb-split-check' },
          h('input', { type: 'checkbox', checked: true, onChange: (e) => { r.keep = e.target.checked; update(); } }),
          h('span', { class: 'gb-tag gb-ptag', dataset: { platform: platformKey(r.platform) } }, platformIcon(r.platform), r.platform)),
        h('span', { class: 'gb-split-badge' }, 'Deze kaart')),
      choice, fields);
  }));

  const form = h('form', { class: 'gb-split-form' },
    h('p', { class: 'gb-form-hint muted' },
      'Elk platform een eigen kaart, gekoppeld als andere versie. De eerste aangevinkte versie blijft deze kaart, met je status, beoordeling en notities. Vink een platform uit als het niet op je lijst hoort (bijvoorbeeld een heruitgave); dan gaat het alleen van de kaart af.'),
    rowsEl, summary, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const keep = rows.filter((r) => r.keep);
    if (!keep.length) return;
    if (keep.some((r) => !(r.existing && r.useExisting) && !r.title)) { ctx.toast('Vul bij elke versie een titel in.', 'error'); return; }
    let res = null;
    await ctx.update((d) => { res = applySplit(d, id, rows); });
    dlg.close();
    if (!res) return;
    const parts = [res.created ? `${res.created} ${res.created === 1 ? 'nieuwe kaart' : 'nieuwe kaarten'}` : '',
      res.linked ? `${res.linked} gekoppeld` : ''].filter(Boolean);
    ctx.toast(parts.length ? `Gesplitst: ${parts.join(', ')}` : 'Platforms bijgewerkt', 'ok');
  });

  const dlg = h('dialog', { class: 'sheet gb-modal gb-split', 'aria-labelledby': 'gb-split-title' },
    h('div', { class: 'sheet-header' },
      h('h2', { id: 'gb-split-title' }, 'Splitsen'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sluiten', onClick: () => dlg.close() }, '✕')),
    h('div', { class: 'sheet-body' },
      h('p', { class: 'gb-split-game' }, g.title),
      form));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  update();
}
