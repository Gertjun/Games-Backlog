// =============================================================
//  Slimmer toevoegen: suggesties tijdens het typen van een titel
// =============================================================
// In "Game toevoegen" zoekt de app na het typen van een paar letters op
// Wikipedia naar games met die titel. Tik je een suggestie aan, dan worden
// titel, jaar, platform, serie en categorie ingevuld. Velden die je zelf al
// hebt ingetypt blijven staan. Bij het opslaan krijgt de game meteen de
// gekozen Wikipedia-pagina, zodat boxart en score direct kloppen.
//
// Alleen wat je typt gaat naar Wikipedia; er wordt niets uit de kluis meegestuurd.

import { h } from './core/dom.js';
import { suggestGames, cleanGameTitle, loadCore } from './gameinfo.js';
import { platformName, cleanSeriesName, matchGroup, sectionFor } from './series.js';
import { platformIcon, platformKey } from './platforms.js';

const DEBOUNCE_MS = 350;
const MIN_CHARS = 3;

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\([^)]*\)/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const splitList = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Koppelt suggesties aan het formulier van Game toevoegen.
 * - form: het formulier (met velden title, section, group, platforms, years)
 * - after: element waarna de suggestielijst komt (het titelveld)
 * - games: je huidige games (voor "staat al in je lijst" en serienamen)
 * - keep: namen van velden die niet overschreven mogen worden (bijvoorbeeld
 *   de serie bij Versie toevoegen)
 * - prefer: platform dat de voorkeur heeft als de game daarop verscheen
 * Geeft { core(), destroy() }: core() is de gekozen Wikipedia-informatie (of null).
 */
export function attachSuggestions({ form, after, games, keep = [], prefer = '' }) {
  const { title, section, group, platforms, years } = form.elements;
  const touched = new Set(keep);
  const have = new Set(games.map((g) => norm(g.title)));
  const groups = [...new Set(games.map((g) => g.group?.trim()).filter(Boolean))];

  let timer = 0;
  let ctrl = null;
  let picked = null; // { core, title }
  let lastQuery = '';

  const list = h('ul', { class: 'gb-suggest', id: 'gb-suggest', role: 'listbox', 'aria-label': 'Suggesties van Wikipedia', hidden: true });
  const status = h('p', { class: 'gb-suggest-status muted', 'aria-live': 'polite', hidden: true });
  const linkEl = h('div', { class: 'gb-suggest-link', hidden: true });
  const chips = h('div', { class: 'gb-suggest-ptags', role: 'group', 'aria-label': 'Platforms van deze game', hidden: true });
  after.after(list, status, linkEl);
  platforms.closest('.field').after(chips);
  title.setAttribute('aria-controls', 'gb-suggest');
  title.setAttribute('aria-autocomplete', 'list');

  for (const el of [section, group, platforms, years]) {
    el.addEventListener('input', () => touched.add(el.name));
    el.addEventListener('change', () => touched.add(el.name));
  }

  const abort = () => { ctrl?.abort(); ctrl = new AbortController(); return ctrl.signal; };
  const hideList = () => { list.hidden = true; list.replaceChildren(); title.setAttribute('aria-expanded', 'false'); };
  const say = (text) => { status.textContent = text; status.hidden = !text; };

  title.addEventListener('input', () => {
    if (picked) unlink(); // andere titel getypt: niet meer aan die pagina koppelen
    clearTimeout(timer);
    const q = title.value.trim();
    if (q.length < MIN_CHARS) { abort(); hideList(); say(''); lastQuery = ''; return; }
    timer = setTimeout(() => search(q), DEBOUNCE_MS);
  });
  title.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('button')?.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); hideList(); }
  });
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(i + 1, items.length - 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i <= 0 ? title : items[i - 1]).focus(); }
    if (e.key === 'Escape') { e.preventDefault(); hideList(); title.focus(); }
  });

  async function search(q) {
    if (q === lastQuery && !list.hidden) return;
    lastQuery = q;
    if (!navigator.onLine) { hideList(); say('Geen suggesties: je bent offline. Je kunt de game gewoon zelf invullen.'); return; }
    const signal = abort();
    let found;
    try {
      found = await suggestGames(q, signal);
    } catch {
      if (signal.aborted) return;
      hideList();
      say('Suggesties zijn nu niet beschikbaar. Je kunt de game gewoon zelf invullen.');
      return;
    }
    if (signal.aborted || title.value.trim() !== q) return;
    say('');
    if (!found.length) { hideList(); return; }
    list.replaceChildren(...found.map((c) => {
      const name = cleanGameTitle(c.title);
      const owned = have.has(norm(name));
      return h('li', { role: 'presentation' }, h('button', {
        type: 'button', role: 'option', class: 'gb-suggest-item',
        onClick: () => pick(c),
      },
      c.thumb
        ? h('img', { class: 'gb-suggest-thumb', src: c.thumb, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' })
        : h('span', { class: 'gb-suggest-thumb is-empty', 'aria-hidden': 'true' }),
      h('span', { class: 'gb-suggest-text' },
        h('span', { class: 'gb-suggest-title' }, name),
        h('span', { class: 'gb-suggest-desc muted' },
          [c.description.replace(/\bvideo game\b/i, 'game'), owned ? 'staat al in je lijst' : ''].filter(Boolean).join(' · ') || 'Wikipedia'))));
    }));
    list.hidden = false;
    title.setAttribute('aria-expanded', 'true');
  }

  async function pick(cand) {
    hideList();
    clearTimeout(timer);
    const name = cleanGameTitle(cand.title);
    title.value = name;
    lastQuery = name;
    const signal = abort();
    say(`Gegevens van ${name} ophalen…`);
    let core;
    try {
      core = await loadCore(cand, signal);
    } catch {
      if (signal.aborted) return;
      say('De gegevens konden niet worden opgehaald. Vul jaar en platform zelf in, of probeer het nog eens.');
      return;
    }
    if (signal.aborted || title.value !== name) return;
    say('');
    picked = { core, title: name };
    fill(core);
    showLink(core);
  }

  function fill(core) {
    const year = core.release?.year || null;
    const toApp = (labels) => [...new Set(labels.map(platformName).filter(Boolean))];
    const options = toApp(core.platformLabels || []);
    const first = toApp(core.firstPlatformLabels || []);

    if (!touched.has('years') && year) years.value = String(year);
    if (!touched.has('platforms') && options.length) {
      // Voorkeur: wat al in het veld stond (bijvoorbeeld van je filter), anders
      // het platform van de eerste release.
      const current = splitList(platforms.value).filter((p) => options.includes(p));
      const chosen = current.length ? current
        : prefer && options.includes(prefer) ? [prefer]
          : [first[0] || options[0]];
      platforms.value = chosen.join(', ');
    }
    const series = core.facts?.series?.[0];
    if (!touched.has('group') && series) group.value = matchGroup(cleanSeriesName(series), groups);
    if (!touched.has('section')) {
      const list = splitList(platforms.value);
      if (list.length) section.value = sectionFor(list, year || 0);
    }
    drawChips(options);
  }

  // Alle platforms waarop de game verscheen. Tik om op de kaart te zetten of weg te halen.
  let chipOptions = [];
  platforms.addEventListener('input', () => { if (!chips.hidden) drawChips(chipOptions); });
  function drawChips(options) {
    chipOptions = options;
    if (options.length < 2) { chips.hidden = true; chips.replaceChildren(); return; }
    const draw = () => {
      const on = new Set(splitList(platforms.value));
      chips.replaceChildren(
        h('span', { class: 'gb-suggest-ptags-label muted' }, 'Verschenen op:'),
        ...options.map((p) => h('button', {
          type: 'button', class: 'gb-tag gb-ptag gb-series-ptag', dataset: { platform: platformKey(p) },
          'aria-pressed': String(on.has(p)),
          onClick: () => {
            const list = splitList(platforms.value);
            platforms.value = (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]).join(', ');
            draw();
          },
        }, platformIcon(p), p)));
    };
    chips.hidden = false;
    draw();
  }

  function showLink(core) {
    linkEl.replaceChildren(
      h('span', {}, 'Boxart en score komen van ', h('strong', {}, core.title), '.'),
      h('button', { type: 'button', class: 'btn btn-small', onClick: () => { unlink(); title.focus(); } }, 'Ontkoppelen'));
    linkEl.hidden = false;
  }

  function unlink() {
    picked = null;
    linkEl.hidden = true;
    linkEl.replaceChildren();
    chips.hidden = true;
    chips.replaceChildren();
  }

  return {
    core: () => picked?.core || null,
    destroy: () => { clearTimeout(timer); ctrl?.abort(); },
  };
}
