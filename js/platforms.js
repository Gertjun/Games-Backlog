// Platformlabels: per platform een eigen kleur (in css/app.css, via
// data-platform) en een icoontje met de vorm van het apparaat.
// De icoontjes zijn eigen, eenvoudige tekeningen (geen merklogo's).

const SVG_NS = 'http://www.w3.org/2000/svg';

// Vormen in een 24×24-raster. 'line' = omtrek, 'dot' = gevuld.
const ICONS = {
  // Controller: thuisconsoles
  controller: [
    ['rect', { x: 2, y: 7, width: 20, height: 11, rx: 5.5 }],
    ['path', { d: 'M7 10.5v4M5 12.5h4' }],
    ['circle', { cx: 16, cy: 11, r: 1.3, dot: true }],
    ['circle', { cx: 18.5, cy: 13.8, r: 1.3, dot: true }],
  ],
  // Disc: PlayStation-thuisconsoles
  disc: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['circle', { cx: 12, cy: 12, r: 2.5 }],
    ['path', { d: 'M12 5.5a6.5 6.5 0 0 1 6.5 6.5' }],
  ],
  // Rechtop handheld: Game Boy en Game Boy Color
  handheld: [
    ['rect', { x: 6, y: 2, width: 12, height: 20, rx: 2 }],
    ['rect', { x: 8.5, y: 4.5, width: 7, height: 6, rx: 1 }],
    ['path', { d: 'M9.5 14.5v3M8 16h3' }],
    ['circle', { cx: 15, cy: 16, r: 1.2, dot: true }],
  ],
  // Liggende handheld: GBA, PSP, Vita en Switch
  wide: [
    ['rect', { x: 1.5, y: 6, width: 21, height: 12, rx: 4 }],
    ['rect', { x: 8, y: 8.5, width: 8, height: 7, rx: 1 }],
    ['path', { d: 'M4.8 10.5v3M3.3 12h3' }],
    ['circle', { cx: 19.2, cy: 12, r: 1.2, dot: true }],
  ],
  // Twee schermen: DS en 3DS
  dual: [
    ['rect', { x: 5, y: 2, width: 14, height: 9, rx: 1.5 }],
    ['rect', { x: 5, y: 13, width: 14, height: 9, rx: 1.5 }],
    ['rect', { x: 8, y: 4.5, width: 8, height: 4, rx: 0.5 }],
  ],
  // Monitor: pc
  monitor: [
    ['rect', { x: 2.5, y: 4, width: 19, height: 12, rx: 1.5 }],
    ['path', { d: 'M12 16v4M8 20h8' }],
  ],
};

const FAMILY = {
  NES: 'controller', SNES: 'controller', N64: 'controller', GC: 'controller',
  Wii: 'controller', 'Wii U': 'controller', PCE: 'controller', Genesis: 'controller', Xbox: 'controller',
  PS1: 'disc', PS2: 'disc', PS3: 'disc', PS4: 'disc', PS5: 'disc',
  GB: 'handheld', GBC: 'handheld',
  GBA: 'wide', PSP: 'wide', 'PS Vita': 'wide', Switch: 'wide',
  NDS: 'dual', '3DS': 'dual',
  PC: 'monitor',
};

/** "Wii U" → "wii-u", "PS Vita" → "ps-vita": sleutel voor de kleur in de CSS. */
export const platformKey = (p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function platformIcon(p) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'gb-picon');
  for (const [tag, { dot, ...attrs }] of ICONS[FAMILY[p] || 'controller']) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (dot) el.setAttribute('class', 'dot');
    svg.append(el);
  }
  return svg;
}
