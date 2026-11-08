// Stelt een nieuwe app in op basis van de template.
// Draait automatisch via .github/workflows/setup.yml, maar kan ook lokaal:
//
//   npm install --no-save --prefix tools sharp@0.33.5
//   APP_NAME="Boodschappen" APP_COLOR="#0f766e" ICON_TEXT="B" node tools/setup.mjs
//
// Omgevingsvariabelen (allemaal optioneel):
//   REPO_NAME   naam van de repo; standaard de mapnaam. Basis voor de rest.
//   APP_NAME    weergavenaam; standaard afgeleid van REPO_NAME ("vaste-lasten" → "Vaste Lasten")
//   SHORT_NAME  naam onder het icoon (max. ~12 tekens); standaard afgeleid van APP_NAME
//   APP_ID      storagePrefix / map in de data-repo; standaard REPO_NAME
//   APP_COLOR   accentkleur als #rrggbb; standaard #2563eb
//   ICON_TEXT   1–2 tekens voor het icoon; leeg = slotje
//   FORCE=1     ook uitvoeren als de app al is ingesteld

import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = (k) => (process.env[k] || '').trim();

// ---------- Invoer ----------

const repoName = env('REPO_NAME') || basename(ROOT);
const slug = (env('APP_ID') || repoName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
const name = env('APP_NAME') || repoName.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase()).trim();
const shortName = env('SHORT_NAME') || (name.length <= 12 ? name : name.split(/\s+/)[0].slice(0, 12));
const color = (env('APP_COLOR') || '#2563eb').toLowerCase();
const iconText = [...env('ICON_TEXT')].slice(0, 2).join('').toUpperCase();

if (!/^#[0-9a-f]{6}$/.test(color)) fail(`Ongeldige kleur "${color}". Gebruik de vorm #0f766e.`);
if (name.length > 45) fail('De naam is te lang (max. 45 tekens).');

// ---------- Hulpjes ----------

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const read = (f) => readFile(join(ROOT, f), 'utf8');
const write = (f, s) => writeFile(join(ROOT, f), s);

async function edit(file, replacements) {
  let s = await read(file);
  for (const [pattern, value] of replacements) {
    if (!pattern.test(s)) fail(`Kon ${pattern} niet vinden in ${file}. Is het bestand handmatig aangepast?`);
    s = s.replace(pattern, value);
  }
  await write(file, s);
}

const jsString = (v) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const html = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (hex, target, amount) => rgbToHex(hexToRgb(hex).map((v, i) => v + (target[i] - v) * amount));
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Tekst op de accentkleur: wit of bijna-zwart, wat het beste contrast geeft.
const contrastOn = (hex) => ((luminance(hex) + 0.05) / 0.05 > 1.05 / (luminance(hex) + 0.05) ? '#0b0d12' : '#ffffff');

// ---------- Al ingesteld? ----------

const config = await read('js/config.js');
const configured = !/storagePrefix:\s*'mijn-app'/.test(config);
if (configured && env('FORCE') !== '1') {
  console.log('App is al ingesteld; niets te doen. (Zet FORCE=1 om opnieuw in te stellen.)');
  process.exit(0);
}

const darkAccent = mix(color, [255, 255, 255], 0.3);
console.log(`Instellen: "${name}" (${shortName}), id "${slug}", kleur ${color}`);

// ---------- Bestanden ----------

await edit('js/config.js', [
  [/name:\s*'[^']*'/, `name: ${jsString(name)}`],
  [/version:\s*'[^']*'/, "version: '1.0.0'"],
  [/storagePrefix:\s*'[^']*'/, `storagePrefix: ${jsString(slug)}`],
  [/defaultDataPath:\s*'[^']*'/, `defaultDataPath: ${jsString(`${slug}/vault.json`)}`],
]);

await edit('sw.js', [[/const VERSION = '[^']*';/, "const VERSION = '1.0.0';"]]);

const manifest = JSON.parse(await read('manifest.webmanifest'));
Object.assign(manifest, { name, short_name: shortName, description: name, theme_color: color });
await write('manifest.webmanifest', `${JSON.stringify(manifest, null, 2)}\n`);

await edit('index.html', [
  [/<title>[^<]*<\/title>/, `<title>${html(name)}</title>`],
  [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${html(name)}">`],
  [/<meta name="apple-mobile-web-app-title" content="[^"]*">/, `<meta name="apple-mobile-web-app-title" content="${html(shortName)}">`],
]);

await edit('css/app.css', [[/\/\* @accent-start \*\/[\s\S]*?\/\* @accent-end \*\//, `/* @accent-start */
:root {
  --accent: ${color};
  --accent-contrast: ${contrastOn(color)};
}
@media (prefers-color-scheme: dark) {
  :root { --accent: ${darkAccent}; --accent-contrast: ${contrastOn(darkAccent)}; }
}
/* @accent-end */`]]);

await write('CHANGELOG.md', `# Changelog\n\n## 1.0.0\n\n- Eerste versie van ${name}.\n`);

// ---------- Iconen ----------

const fg = contrastOn(color);
const glyph = iconText
  ? `<text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="700" font-size="${iconText.length > 1 ? 210 : 280}" fill="${fg}">${html(iconText)}</text>`
  : `<rect x="156" y="236" width="200" height="150" rx="28" fill="${fg}"/>
  <path d="M196 236v-40a60 60 0 0 1 120 0v40" fill="none" stroke="${fg}" stroke-width="36" stroke-linecap="round"/>
  <circle cx="256" cy="300" r="20" fill="${color}"/>
  <rect x="246" y="300" width="20" height="44" rx="10" fill="${color}"/>`;

const svg = ({ rounded = true, safe = 1 } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${color}"/>
  <g transform="translate(256 256) scale(${safe}) translate(-256 -256)">
  ${glyph}
  </g>
</svg>
`;

await write('icons/icon.svg', `<!-- Bronbestand van het icoon (gemaakt door tools/setup.mjs). -->\n${svg()}`);

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  try {
    sharp = (await import(join(ROOT, 'tools/node_modules/sharp/lib/index.js'))).default;
  } catch {
    console.warn('! sharp niet gevonden: PNG-iconen zijn NIET bijgewerkt (alleen icons/icon.svg).');
  }
}

if (sharp) {
  const png = (source, size, file) => sharp(Buffer.from(source)).resize(size, size).png().toFile(join(ROOT, 'icons', file));
  await png(svg(), 192, 'icon-192.png');
  await png(svg(), 512, 'icon-512.png');
  await png(svg({ rounded: false, safe: 0.72 }), 512, 'icon-maskable-512.png'); // veilige zone voor Android
  await png(svg({ rounded: false }), 180, 'apple-touch-icon.png');               // iOS rondt zelf af
  await png(svg(), 32, 'favicon-32.png');
}

console.log('✓ Klaar.');
