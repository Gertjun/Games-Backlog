import { access, readFile } from 'node:fs/promises';
import { resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parsePrecache(source) {
  if (typeof source !== 'string') throw new TypeError('Service-worker-bron moet tekst zijn.');
  const match = source.match(/\b(?:const|let|var)\s+PRECACHE\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!match) throw new Error('Geen statische PRECACHE-array gevonden in de service worker.');

  const body = match[1].replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/[^\n]*/g, (comment, prefix = '') => prefix);
  const entries = [];
  let offset = 0;
  const token = /\s*(?:"([^"\n]*)"|'([^'\n]*)')\s*(,|$)/y;

  while (offset < body.length) {
    token.lastIndex = offset;
    const found = token.exec(body);
    if (!found) {
      if (!body.slice(offset).trim()) break;
      throw new Error('PRECACHE moet uitsluitend statische stringpaden bevatten (positie ' + offset + ').');
    }
    entries.push(found[1] ?? found[2]);
    offset = token.lastIndex;
  }
  if (entries.length === 0) throw new Error('PRECACHE bevat geen statische bestandspaden.');
  return entries;
}

function normalizeLocalPath(value) {
  // De app-root is een geldige statische precache-entry; index.html blijft daarnaast expliciet opgenomen.
  if (value === './' || value === '.') return '.';
  if (typeof value !== 'string' || !value.trim()) throw new Error('Leeg pad in PRECACHE.');
  if (/^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('/')) {
    throw new Error('Precache-pad moet lokaal en relatief zijn: ' + value);
  }
  const normalized = posix.normalize(value.replace(/^\.\//, ''));
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('\\')) {
    throw new Error('Onveilig precache-pad: ' + value);
  }
  return normalized;
}

export async function validatePrecache({ root = process.cwd(), manifestPath = 'core-manifest.json', serviceWorkerPath = 'sw.js' } = {}) {
  const manifestFile = resolve(root, manifestPath);
  const serviceWorkerFile = resolve(root, serviceWorkerPath);
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (!Array.isArray(manifest.allowlist) || manifest.allowlist.length === 0) {
    throw new Error('Manifest bevat geen geldige allowlist.');
  }

  const source = await readFile(serviceWorkerFile, 'utf8');
  const entries = parsePrecache(source).map(normalizeLocalPath);
  const duplicateEntries = entries.filter((path, index) => entries.indexOf(path) !== index);
  if (duplicateEntries.length) {
    throw new Error('Dubbele PRECACHE-vermelding(en): ' + [...new Set(duplicateEntries)].join(', '));
  }

  const missing = [];
  for (const item of manifest.allowlist) {
    const path = normalizeLocalPath(item);
    try {
      await access(resolve(root, path));
    } catch {
      missing.push(path + ' (bestand ontbreekt)');
      continue;
    }
    if (!entries.includes(path)) missing.push(path);
  }

  if (missing.length) {
    throw new Error('Core-bestanden ontbreken in PRECACHE of app-map:\n- ' + missing.join('\n- '));
  }
  return { checked: manifest.allowlist.length, precacheEntries: entries.length, manifestVersion: manifest.coreVersion ?? 'unknown' };
}

async function main() {
  const args = process.argv.slice(2);
  let manifestPath = 'core-manifest.json';
  let serviceWorkerPath = 'sw.js';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && args[i + 1]) manifestPath = args[++i];
    else if (args[i] === '--service-worker' && args[i + 1]) serviceWorkerPath = args[++i];
    else throw new Error('Gebruik: node tools/precache.mjs [--manifest core-manifest.json] [--service-worker sw.js]');
  }

  const result = await validatePrecache({ manifestPath, serviceWorkerPath });
  console.log('PRECACHE OK: ' + result.checked + ' core-bestanden gecontroleerd (' + result.manifestVersion + '); ' + result.precacheEntries + ' statische entries gevonden.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('PRECACHE FOUT: ' + error.message);
    process.exitCode = 1;
  });
}
