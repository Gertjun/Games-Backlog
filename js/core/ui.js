// Kleine bouwstenen die in elke app hetzelfde horen te werken en eruit te zien.
// De stijl staat in base.css.

import { h } from './dom.js';

/**
 * Filter met een vaste regel voor al mijn apps:
 * op de telefoon een rij chips, op iPad en laptop een keuzelijst.
 * @param {{label: string, options: Array<{value: string, label: string}>, value: string, onChange: (v: string) => void}} o
 */
export function filterControl({ label, options, value, onChange }) {
  const chips = h('div', { class: 'filter-chips', role: 'group', 'aria-label': label },
    options.map((o) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(o.value === value),
      onClick: () => { if (o.value !== value) onChange(o.value); },
    }, o.label)));
  const select = h('select', { 'aria-label': label, onChange: (e) => onChange(e.target.value) },
    options.map((o) => h('option', { value: o.value, selected: o.value === value ? true : null }, o.label)));
  select.value = value;
  return h('div', { class: 'filter' }, chips,
    h('label', { class: 'filter-select' }, h('span', {}, label), select));
}

/** Leeg scherm: korte titel met één regel uitleg en eventueel een knop. */
export function emptyState(title, text, action) {
  return h('div', { class: 'empty' },
    h('p', { class: 'empty-title' }, title),
    text ? h('p', { class: 'muted' }, text) : null,
    action ?? null);
}

/** Kaart met een optionele kop. */
export function card(title, ...children) {
  return h('section', { class: 'card card-pad' }, title ? h('h2', { class: 'card-title' }, title) : null, ...children);
}
