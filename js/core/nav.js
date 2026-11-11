// Navigatie tussen de schermen van de app. Eén <nav>; base.css bepaalt de vorm:
//   telefoon            → tabbalk onderin
//   iPad rechtop        → tabbladen in een rij onder de kopbalk
//   laptop, iPad liggend → inklapbare zijbalk links, met bovenaan icoon, naam en versie
//
// De app geeft zijn schermen op in app.screens: [{ id, label, icon }].
// `icon` is een naam uit ICONS of een lijst SVG-paden (24×24, lijntekening).
// Instellingen komt er altijd als laatste bij; dat scherm is van de schil.

import { APP } from '../config.js';
import { h } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLLAPSE_KEY = `${APP.storagePrefix}:nav-collapsed`;

export const ICONS = {
  overview: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  chart: ['M4 20h16', 'M7 16v-4', 'M12 16V7', 'M17 16v-7'],
  check: ['M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z', 'M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2', 'm9 14 2 2 4-4'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4Z', 'm13.5 6.5 4 4'],
  history: ['M4 12a8 8 0 1 0 2.5-5.8', 'M4 4v4h4', 'M12 8v4l3 2'],
  wallet: ['M4 7a2 2 0 0 1 2-2h11v4', 'M4 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2Z', 'M16 14h.01'],
  swap: ['M4 8h14', 'm15 5 3 3-3 3', 'M20 16H6', 'm9 13-3 3 3 3'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M12 12h.01'],
  star: ['m12 4 2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.5-.8L12 4Z'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
  collapse: ['M15 6l-6 6 6 6'],
};

export function icon(nameOrPaths, className = 'app-nav-ico') {
  const paths = Array.isArray(nameOrPaths) ? nameOrPaths : (ICONS[nameOrPaths] ?? ICONS.overview);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const SETTINGS = { id: 'settings', label: 'Instellingen', icon: 'settings' };

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

/**
 * @param {{screens: Array, host: Element, onChange: (id: string) => void, onSettings: () => void, onLeaveSettings: () => void}} opts
 */
export function createNav({ screens, host, onChange, onSettings, onLeaveSettings }) {
  const all = [...(screens?.length ? screens : [{ id: 'main', label: 'Overzicht', icon: 'overview' }]), SETTINGS];
  let appScreen = all[0].id; // laatst gekozen scherm van de app zelf
  let current = appScreen;   // wat er nu te zien is (ook 'settings')
  const titleEl = host.querySelector('[data-screen-title]');

  const buttons = all.map((s) => h('button', {
    type: 'button', class: 'app-nav-btn', title: s.label, dataset: { screen: s.id },
    onClick: () => (s.id === 'settings' ? onSettings() : select(s.id)),
  }, icon(s.icon), h('span', { class: 'app-nav-label' }, s.label), h('span', { class: 'app-nav-badge', hidden: true })));

  const collapseBtn = h('button', { type: 'button', class: 'app-nav-collapse', onClick: () => setCollapsed(!readCollapsed()) },
    icon('collapse'));
  const brand = h('div', { class: 'app-nav-brand' },
    h('img', { src: 'icons/icon-192.png', alt: '', class: 'app-brand-icon', width: 36, height: 36 }),
    h('span', { class: 'app-brand-text' },
      h('span', { class: 'app-title' }, APP.name),
      h('span', { class: 'app-brand-version' }, `v${APP.version}`)),
    collapseBtn);
  const nav = h('nav', { class: 'app-nav', 'aria-label': 'Schermen' }, brand, h('div', { class: 'app-nav-items' }, buttons));
  const header = host.querySelector('.app-header');
  if (header) header.after(nav); else host.append(nav);

  function setCollapsed(on) {
    try { localStorage.setItem(COLLAPSE_KEY, on ? '1' : '0'); } catch { /* geen opslag */ }
    host.classList.toggle('nav-collapsed', on);
    const label = on ? 'Zijbalk uitklappen' : 'Zijbalk inklappen';
    collapseBtn.title = label;
    collapseBtn.setAttribute('aria-label', label);
    window.dispatchEvent(new Event('resize')); // grafieken rekenen hun breedte opnieuw uit
  }

  function show(id) {
    current = id;
    host.dataset.screen = id;
    if (titleEl) titleEl.textContent = all.find((s) => s.id === id)?.label ?? '';
    for (const b of buttons) {
      if (b.dataset.screen === id) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
  }

  function select(id) {
    if (!all.some((s) => s.id === id) || id === 'settings') return;
    const changed = id !== appScreen;
    const fromSettings = current === 'settings';
    appScreen = id;
    show(id);
    if (fromSettings) onLeaveSettings();
    window.scrollTo(0, 0);
    if (changed || fromSettings) onChange(id);
  }

  setCollapsed(readCollapsed());
  show(appScreen);

  return {
    /** Het scherm dat de app moet tekenen. */
    get screen() { return appScreen; },
    get current() { return current; },
    select,
    /** De schil meldt dat Instellingen open of dicht is. */
    showSettings() { show('settings'); window.scrollTo(0, 0); },
    hideSettings() { if (current === 'settings') show(appScreen); },
    /** Getal op een knop (0 = verbergen). */
    setBadge(id, n) {
      const btn = buttons.find((b) => b.dataset.screen === id);
      const badge = btn?.querySelector('.app-nav-badge');
      if (!badge) return;
      badge.hidden = !n;
      badge.textContent = n > 99 ? '99+' : String(n || '');
    },
  };
}
