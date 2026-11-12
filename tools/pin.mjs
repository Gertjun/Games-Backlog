import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const stableSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const fullCommit = /^[a-f0-9]{40}$/;
const sha256 = /^[a-f0-9]{64}$/;
const allowedPath = path => path === 'css/base.css' || /^js\/core\/[A-Za-z0-9._-]+\.js$/.test(path);

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateReleasePin(pin, manifest, manifestBytes) {
  if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
    throw new Error('Release-pin moet een JSON-object zijn.');
  }
  if (pin.schemaVersion !== 1) throw new Error('Ongeldige of niet-ondersteunde pin schemaVersion.');
  if (pin.repository !== 'Gertjun/PWA-Core') {
    throw new Error('Release-pin moet een repository in owner/name-formaat bevatten.');
  }
  if (typeof pin.version !== 'string' || !stableSemver.test(pin.version)) {
    throw new Error('Release-pin version moet een stabiele SemVer-versie zijn (X.Y.Z).');
  }
  if (pin.tag !== 'v' + pin.version) throw new Error('Release-pin tag moet exact v + version zijn.');
  if (typeof pin.commit !== 'string' || !fullCommit.test(pin.commit)) {
    throw new Error('Release-pin moet een volledige 40-teken commit-SHA bevatten.');
  }
  if (typeof pin.manifestSha256 !== 'string' || !sha256.test(pin.manifestSha256)) {
    throw new Error('Release-pin moet een geldige SHA-256 van core-manifest.json bevatten.');
  }
  if (digest(manifestBytes) !== pin.manifestSha256) {
    throw new Error('core-manifest.json komt niet overeen met manifestSha256 in de release-pin.');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Core-manifest moet een JSON-object zijn.');
  }
  if (manifest.schemaVersion !== 1 || manifest.releaseStatus !== 'released') {
    throw new Error('Release-pin vereist een ondersteund, released core-manifest.');
  }
  if (manifest.coreVersion !== pin.version) {
    throw new Error('Release-pin version komt niet overeen met coreVersion.');
  }
  if (!Array.isArray(manifest.allowlist) || manifest.allowlist.length === 0 ||
      new Set(manifest.allowlist).size !== manifest.allowlist.length ||
      manifest.allowlist.some(path => typeof path !== 'string' || !allowedPath(path) ||
        path.includes('..') || path.includes('\\') || path.startsWith('/'))) {
    throw new Error('Core-manifest bevat een ongeldige allowlist.');
  }
  if (!manifest.checksums || typeof manifest.checksums !== 'object' || Array.isArray(manifest.checksums)) {
    throw new Error('Core-manifest bevat geen geldige checksum-map.');
  }
  const keys = Object.keys(manifest.checksums);
  if (keys.length !== manifest.allowlist.length ||
      keys.some(path => !manifest.allowlist.includes(path)) ||
      manifest.allowlist.some(path => !Object.hasOwn(manifest.checksums, path))) {
    throw new Error('Core-manifest moet exact één checksum per allowlisted bestand bevatten.');
  }
  for (const [path, checksum] of Object.entries(manifest.checksums)) {
    if (typeof checksum !== 'string' || !sha256.test(checksum)) {
      throw new Error('Ongeldige SHA-256-checksum voor ' + path + '.');
    }
  }
  return { repository: pin.repository, version: pin.version, tag: pin.tag, commit: pin.commit, files: manifest.allowlist.length };
}

async function readRegularFile(root, path) {
  const absolute = resolve(root, path);
  const relative = absolute.slice(resolve(root).length + 1);
  if (!relative || relative === '..' || relative.startsWith('..' + sep)) {
    throw new Error('Pad valt buiten de app-root: ' + path);
  }
  let current = resolve(root);
  for (const part of path.split('/')) {
    current = resolve(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('Symlinks zijn niet toegestaan: ' + path);
  }
  const info = await lstat(absolute);
  if (!info.isFile()) throw new Error('Kernbestand moet een regulier bestand zijn: ' + path);
  return readFile(absolute);
}

export async function verifyReleasePin({ root = process.cwd(), pinPath = 'pwa-core.lock.json', manifestPath = 'core-manifest.json' } = {}) {
  const pinBytes = await readFile(resolve(root, pinPath));
  const manifestBytes = await readFile(resolve(root, manifestPath));
  const pin = JSON.parse(pinBytes.toString('utf8'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const result = validateReleasePin(pin, manifest, manifestBytes);
  for (const path of manifest.allowlist) {
    const actual = digest(await readRegularFile(root, path));
    if (actual !== manifest.checksums[path]) throw new Error('Core-bestand checksum mismatch: ' + path);
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== 'verify') throw new Error('Gebruik: node tools/pin.mjs verify [--pin pwa-core.lock.json] [--manifest core-manifest.json]');
  const value = flag => {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  };
  const result = await verifyReleasePin({
    pinPath: value('--pin') || 'pwa-core.lock.json',
    manifestPath: value('--manifest') || 'core-manifest.json',
  });
  console.log('PWA-Core pin OK: ' + result.repository + ' ' + result.tag + ' (' + result.commit + '), ' + result.files + ' bestanden.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('PINVALIDATIE FOUT: ' + error.message);
    process.exitCode = 1;
  });
}
