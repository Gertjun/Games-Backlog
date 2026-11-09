// =============================================================
//  Instellingen op brede schermen (laptop, iPad liggend)
// -------------------------------------------------------------
//  Links een lijst met onderdelen, rechts de inhoud van het gekozen
//  onderdeel. Op smalle schermen staat alles gewoon onder elkaar.
//
//  Dit bestand raakt geen gegevens aan: het leest alleen de teksten
//  die core/shell.js al in het instellingenscherm zet (sync-status,
//  Face ID-status, versie) en toont daar een kort label van.
//  Generiek opgezet, zodat het ook in de PWA-template kan.
// =============================================================
import { $, $$ } from './core/dom.js';
import { APP } from './config.js';

const WIDE = matchMedia('(min-width: 900px)');
const dlg = $('#dlg-settings');
const nav = dlg?.querySelector('.settings-nav');


function init() {
  const tabs = $$('.settings-tab', nav);
  const panes = $$('.settings-section[data-pane]', dlg);
  let current = tabs[0].dataset.pane;

  function select(name, { focus = false } = {}) {
    if (!tabs.some((t) => t.dataset.pane === name)) return;
    current = name;
    for (const t of tabs) {
      const on = t.dataset.pane === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    for (const p of panes) p.classList.toggle('is-active', p.dataset.pane === name);
    dlg.querySelector('.settings-panes').scrollTop = 0;
  }

  function applyMode() {
    nav.hidden = !WIDE.matches;
    dlg.classList.toggle('is-wide', WIDE.matches);
    select(current);
  }

  nav.addEventListener('click', (e) => {
    const tab = e.target.closest('.settings-tab');
    if (tab) select(tab.dataset.pane);
  });

  // Pijltjes omhoog/omlaag, Home en End in de lijst met onderdelen.
  nav.addEventListener('keydown', (e) => {
    const i = tabs.findIndex((t) => t.dataset.pane === current);
    const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length].dataset.pane, { focus: true });
  });

  // De schil scrolt bij "openSettings('sync')" naar #settings-sync.
  // Op een breed scherm kiezen we in plaats daarvan dat onderdeel.
  // Bij elke keer openen begint het scherm bij Synchronisatie.
  new MutationObserver(() => {
    if (dlg.open) { select(tabs[0].dataset.pane); updateBadges(); }
  }).observe(dlg, { attributes: true, attributeFilter: ['open'] });

  // Labels bijwerken zodra de schil de statusteksten aanpast.
  const watch = ['#sync-status', '#bio-status', '#btn-bio-toggle', '#version-warning', '#btn-github-remove', '#btn-sync'];
  const obs = new MutationObserver(updateBadges);
  for (const sel of watch) {
    const el = $(sel);
    if (el) obs.observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  }
  dlg.addEventListener('input', (e) => { if (e.target.closest('#form-github')) updateBadges(); });

  WIDE.addEventListener('change', applyMode);
  applyMode();
  updateBadges();
}

const SYNC_BADGES = {
  ok: ['ok', 'Gekoppeld'],
  pending: ['warn', 'Nog niet gesynchroniseerd'],
  syncing: ['accent', 'Bezig…'],
  error: ['danger', 'Probleem'],
  off: ['muted', 'Niet ingesteld'],
};

function setBadge(name, tone, text) {
  const el = dlg.querySelector(`[data-badge="${name}"]`);
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
  el.hidden = !text;
}

function updateBadges() {
  // Synchronisatie: de toestand staat op de sync-knop in de balk.
  const state = $('#btn-sync')?.dataset.state ?? 'off';
  setBadge('sync', ...(SYNC_BADGES[state] ?? SYNC_BADGES.off));

  // Waarmee is dit apparaat gekoppeld? (uit de velden die de schil invult)
  const f = $('#form-github');
  const target = $('#sync-target');
  const linked = !$('#btn-github-remove').hidden;
  const owner = f?.elements.owner.value.trim();
  const repo = f?.elements.repo.value.trim();
  const unlinkHint = $('#sync-unlink-hint');
  if (unlinkHint) unlinkHint.hidden = !linked;
  if (target) {
    target.hidden = !(linked && owner && repo);
    target.textContent = linked && owner && repo
      ? `Gekoppeld met ${owner}/${repo}, bestand ${f.elements.path.value.trim() || APP.defaultDataPath}.`
      : '';
  }

  // Beveiliging: Face ID / passkey aan of uit.
  const bioOn = $('#btn-bio-toggle')?.textContent.trim() === 'Uitschakelen';
  setBadge('security', bioOn ? 'ok' : 'muted', bioOn ? 'Face ID aan' : 'Face ID uit');

  // Over de app: versie, of een waarschuwing als bijwerken nodig is.
  const mustUpdate = !$('#version-warning').hidden;
  setBadge('about', mustUpdate ? 'danger' : 'muted', mustUpdate ? 'Bijwerken nodig' : `v${APP.version}`);

  setBadge('backup', '', '');
  setBadge('device', '', '');
}

// Pas aan het eind starten, als alle constanten hierboven bestaan.
if (dlg && nav) init();
