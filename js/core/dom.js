// Kleine DOM-helpers. Gebruik h() voor alle gebruikersdata: tekst gaat via
// textContent, dus geen risico op HTML-injectie. Nooit innerHTML met data.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * h('button', { class: 'btn', onClick: fn, disabled: true }, 'Tekst', kindElement)
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked') el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export const formValues = (form) => Object.fromEntries(new FormData(form));

/** Draait als geïnstalleerde app op een telefoon/tablet (beginscherm). */
export const isMobileStandalone = () =>
  (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)
  && navigator.maxTouchPoints > 0;

function downloadFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Bestand bewaren. In de geïnstalleerde app op iPhone/Android via het
 * deelmenu (Bewaar in Bestanden, AirDrop…), anders als gewone download.
 * Roep aan vanuit een klik (het deelmenu vereist een gebruikersactie).
 */
export async function saveFile(filename, text, type = 'application/json') {
  const file = new File([text], filename, { type });
  if (isMobileStandalone() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // gebruiker annuleerde
    }
  }
  downloadFile(filename, file);
}

const timeFmt = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString() ? `om ${timeFmt.format(d)}` : `op ${dateTimeFmt.format(d)}`;
}

/** Datum van vandaag als 'yyyy-mm-dd' in lokale tijd. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const euroFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
/** Bedragen worden als centen (integers) opgeslagen: formatEuro(1250) → '€ 12,50'. */
export const formatEuro = (cents) => euroFmt.format((cents || 0) / 100);

/**
 * Invoer van een bedrag naar centen. Begrijpt Nederlandse notatie:
 *   '12,50' → 1250   '€ 1.250,00' → 125000   '12.5' → 1250   '1.250' → 125000   '-3' → -300
 * Geeft null bij ongeldige invoer. Rekent zonder afrondingsfouten.
 */
export function parseEuro(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = String(input ?? '').replace(/[€\s ]/g, '').replace(/^\+/, '');
  if (!s) return null;
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // 1.250,50
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.250 = duizendtal
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [euros, cents = ''] = s.split('.');
  const total = Number(euros) * 100 + Number(cents.padEnd(2, '0'));
  return negative ? -total : total;
}
