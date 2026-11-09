// Eigen uitklapmenu in plaats van <select>, zodat elke keuze rechts een
// aantal kan tonen ("Backlog ........ 156"). Een gewone <select> kan dat niet.
//
// dropdown({ label, value: () => huidige, options: () => [[waarde, tekst, aantal?], …], onChange })
// geeft { el, update } terug. update() ververst de knop (tekst en aantal);
// de lijst zelf wordt bij elk openen opnieuw opgebouwd, dus de aantallen
// kloppen altijd met de filters van dat moment.
//
// Toetsenbord: Enter/Spatie/pijl omlaag opent, pijlen/Home/End lopen door de
// keuzes, Enter kiest, Escape sluit. Tikken buiten het menu sluit het ook.

import { h } from './core/dom.js';

let uid = 0;
let openMenu = null; // er is altijd maar één menu tegelijk open

const SVG_NS = 'http://www.w3.org/2000/svg';
function chevron() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'gb-dd-chev');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'm6 9 6 6 6-6');
  svg.append(p);
  return svg;
}

export function dropdown({ label, value, options, onChange }) {
  const id = `gb-dd-${++uid}`;
  const textEl = h('span', { class: 'gb-dd-text' });
  const countEl = h('span', { class: 'gb-dd-n' });
  const btn = h('button', {
    type: 'button', class: 'gb-dd-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': id,
  }, textEl, countEl, chevron());
  const list = h('ul', { class: 'gb-dd-list', role: 'listbox', id, tabindex: '-1', 'aria-label': label, hidden: true });
  const el = h('div', { class: 'gb-dd' }, btn, list);

  let items = [];
  let active = -1;

  const current = () => {
    const opts = options();
    return opts.find(([v]) => v === value()) || opts[0];
  };

  function update() {
    const [, text, n] = current() || ['', ''];
    textEl.textContent = text;
    countEl.textContent = n == null ? '' : String(n);
    btn.setAttribute('aria-label', `${label}: ${text}${n == null ? '' : `, ${n}`}`);
  }

  function setActive(i) {
    if (!items.length) return;
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((li, j) => li.classList.toggle('is-active', j === active));
    list.setAttribute('aria-activedescendant', items[active].id);
    items[active].scrollIntoView({ block: 'nearest' });
  }

  function place() {
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 240), vw - 16);
    const left = Math.min(Math.max(r.left, 8), vw - width - 8);
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    const maxH = Math.min(380, up ? above : below);
    Object.assign(list.style, {
      left: `${left}px`, width: `${width}px`, maxHeight: `${maxH}px`,
      top: up ? '' : `${r.bottom + 4}px`, bottom: up ? `${vh - r.top + 4}px` : '',
    });
  }

  function choose(v) {
    close(true);
    if (v !== value()) onChange(v);
    update();
  }

  function open() {
    if (openMenu) openMenu.close(false);
    const cur = value();
    items = options().map(([v, text, n], i) => {
      const li = h('li', {
        role: 'option', id: `${id}-${i}`, class: 'gb-dd-opt', 'aria-selected': String(v === cur),
        onClick: () => choose(v),
        onPointermove: () => setActive(i),
      }, h('span', { class: 'gb-dd-text' }, text), n == null ? null : h('span', { class: 'gb-dd-n' }, String(n)));
      if (n === 0) li.classList.add('is-empty');
      li.dataset.value = v;
      return li;
    });
    list.replaceChildren(...items);
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    el.classList.add('is-open');
    place();
    setActive(Math.max(0, items.findIndex((li) => li.getAttribute('aria-selected') === 'true')));
    list.focus({ preventScroll: true });
    openMenu = { close, el };
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, true);
  }

  function close(focusBtn) {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    el.classList.remove('is-open');
    list.removeAttribute('aria-activedescendant');
    if (openMenu?.el === el) openMenu = null;
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('scroll', onScroll, true);
    if (focusBtn) btn.focus({ preventScroll: true });
  }

  function onOutside(e) { if (!el.contains(e.target)) close(false); }
  function onResize() { close(false); }
  function onScroll(e) { if (e.target !== list && !list.contains(e.target)) place(); }

  btn.addEventListener('click', () => (list.hidden ? open() : close(true)));
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(); }
  });
  list.addEventListener('keydown', (e) => {
    const keys = {
      ArrowDown: () => setActive(active + 1),
      ArrowUp: () => setActive(active - 1),
      Home: () => setActive(0),
      End: () => setActive(items.length - 1),
      PageDown: () => setActive(active + 8),
      PageUp: () => setActive(active - 8),
      Enter: () => items[active] && choose(items[active].dataset.value),
      ' ': () => items[active] && choose(items[active].dataset.value),
      Escape: () => close(true),
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); return; }
    if (e.key === 'Tab') { close(false); return; }
    // Typen springt naar de eerste keuze die met die letter begint
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const n = items.length;
      for (let s = 1; s <= n; s++) {
        const i = (active + s) % n;
        if (items[i].textContent.trim().toLowerCase().startsWith(k)) { setActive(i); break; }
      }
    }
  });

  update();
  return { el, update, close: () => close(false) };
}
