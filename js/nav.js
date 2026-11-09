// =============================================================
//  Navigatie tussen de schermen: Overzicht, Analyse, Controle en Instellingen
// -------------------------------------------------------------
//  Laptop en iPad liggend (vanaf 1000px): een zijbalk links met bovenaan
//  het app-icoon, de naam en de versie; de kopbalk toont dan de titel van
//  het huidige scherm.
//  iPhone en iPad staand: een tabbalk onderin.
//  Het is één <nav>; de CSS (app.css, "Navigatie") bepaalt de vorm.
//
//  Overzicht, Analyse en Controle tekent app.js in #app-root. Instellingen is het
//  scherm van de schil (#dlg-settings met data-mode="page"): die knop heeft
//  data-open-settings, de schil opent het en meldt dat met "settings:open".
//  Dit bestand raakt geen gegevens aan.
// =============================================================
import { h } from './core/dom.js';
import { APP } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  overview: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  analysis: ['M4 20h16', 'M7 16v-4', 'M12 16V7', 'M17 16v-7'],
  check: ['M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z', 'M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2', 'm9 14 2 2 4-4'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
};

const SCREENS = [
  { id: 'overview', label: 'Overzicht' },
  { id: 'analysis', label: 'Analyse' },
  { id: 'check', label: 'Controle' },
  { id: 'settings', label: 'Instellingen' },
];

const appEl = document.getElementById('screen-app');
const dlg = document.getElementById('dlg-settings');
let appScreen = 'overview'; // laatst gekozen scherm dat app.js tekent
let current = 'overview'; // wat er nu te zien is (ook 'settings')
let listener = () => {};

function navIcon(paths) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'app-nav-ico');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const buttons = SCREENS.map((s) => h('button', {
  type: 'button', class: 'app-nav-btn', dataset: { screen: s.id },
  'data-open-settings': s.id === 'settings' ? true : null,
  onClick: () => { if (s.id !== 'settings') select(s.id); },
}, navIcon(ICONS[s.id]), h('span', { class: 'app-nav-label' }, s.label),
s.id === 'check' ? h('span', { class: 'app-nav-badge', hidden: true }) : null));

// Bovenaan de zijbalk (vanaf 1000px): app-icoon met naam en versie.
// Op smallere schermen staat dit in de kopbalk en is dit blok verborgen.
const brand = h('div', { class: 'app-nav-brand' },
  h('img', { src: 'icons/icon-192.png', alt: '', class: 'app-brand-icon', width: 36, height: 36 }),
  h('span', { class: 'app-brand-text' },
    h('span', { class: 'app-title' }, APP.name),
    h('span', { class: 'app-brand-version' }, `v${APP.version}`)));

const nav = h('nav', { class: 'app-nav', 'aria-label': 'Schermen' }, brand,
  h('div', { class: 'app-nav-items' }, buttons));
appEl?.append(nav);

// Titel van het huidige scherm in de kopbalk (vanaf 1000px zichtbaar)
const titleEl = document.querySelector('[data-screen-title]');

function show(id) {
  current = id;
  if (appEl) appEl.dataset.screen = id;
  if (titleEl) titleEl.textContent = SCREENS.find((s) => s.id === id)?.label ?? '';
  for (const b of buttons) {
    if (b.dataset.screen === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
}

/** Naar Overzicht, Analyse of Controle. */
export function select(id) {
  const changed = id !== appScreen;
  appScreen = id;
  show(id);
  if (dlg?.open) dlg.close(); // instellingen dicht (het close-event hieronder doet dan niets meer)
  window.scrollTo(0, 0);
  if (changed) listener(id);
}

/** Welk scherm app.js moet tekenen. */
export const currentScreen = () => appScreen;

/** Wordt aangeroepen als je naar een ander scherm van de app gaat. */
export function onScreenChange(fn) { listener = fn; }

/** Aantal op de Controle-knop (0 = verbergen). */
export function setCheckCount(n) {
  const badge = nav.querySelector('[data-screen="check"] .app-nav-badge');
  if (!badge) return;
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : String(n);
  const btn = badge.closest('button');
  btn.setAttribute('aria-label', n ? `Controle, ${n} ${n === 1 ? 'game' : 'games'} om na te kijken` : 'Controle');
}

document.addEventListener('settings:open', () => { show('settings'); window.scrollTo(0, 0); });
dlg?.addEventListener('close', () => { if (current === 'settings') show(appScreen); });
show(appScreen);
