// De kluis: versleutelde opslag van alle app-gegevens op dit apparaat.
// Het kluisbestand ("envelope") is lokaal en op GitHub identiek van vorm:
//
// {
//   format: 'pwa-vault', version: 1,
//   kdf: { name: 'PBKDF2-SHA256', iterations, salt },
//   wrappedKey: { iv, data },   // datasleutel, ingepakt met wachtwoordsleutel
//   payload:    { iv, data },   // de gegevens, versleuteld met de datasleutel
//   updatedAt
// }
//
// Opslaan gebeurt via een wachtrij: wijzigingen worden altijd in de juiste
// volgorde weggeschreven, ook als ze heel snel na elkaar komen.

import { APP } from '../config.js';
import * as c from './crypto.js';

const P = APP.storagePrefix;
export const KEYS = { vault: `${P}:vault`, device: `${P}:device`, sync: `${P}:sync` };
const FORMAT = 'pwa-vault';
const FORMAT_VERSION = 1;

let dataKey = null;
let data = null;
let envelope = null;
let revision = 0;          // telt lokale wijzigingen
let persistedRevision = 0; // welke wijziging nu in `envelope` staat
let queue = Promise.resolve();

export class WrongPasswordError extends Error {
  constructor() { super('Onjuist wachtwoord.'); this.name = 'WrongPasswordError'; }
}

function load(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err?.name === 'QuotaExceededError') throw new Error('De opslag op dit apparaat is vol.');
    throw err;
  }
}

function requireUnlocked() {
  if (!dataKey) throw new Error('De kluis is vergrendeld.');
}

function enqueue(job) {
  const run = queue.then(job);
  queue = run.catch((err) => console.error('Opslaan mislukt:', err));
  return run;
}

/** Wacht tot alle openstaande opslagacties klaar zijn. */
export const flush = () => queue;

/** Schrijft de huidige stand weg (in volgorde, via de wachtrij). */
function persist({ reencrypt }) {
  const snapData = data;
  const snapKey = dataKey;
  const snapRev = revision;
  return enqueue(async () => {
    if (reencrypt) {
      envelope = { ...envelope, payload: await c.encryptJSON(snapData, snapKey), updatedAt: Date.now() };
    }
    save(KEYS.vault, envelope);
    persistedRevision = snapRev;
  });
}

export function validateEnvelope(env) {
  if (!env || env.format !== FORMAT || !env.kdf || !env.wrappedKey || !env.payload) {
    throw new Error('Dit is geen geldig kluisbestand.');
  }
  if (env.version > FORMAT_VERSION) {
    throw new Error('Dit kluisbestand is gemaakt met een nieuwere versie van de app. Werk de app eerst bij.');
  }
}

export const hasVault = () => load(KEYS.vault) !== null;
export const isUnlocked = () => dataKey !== null;
export const getRevision = () => revision;
export const getPersistedRevision = () => persistedRevision;
export function getData() { requireUnlocked(); return data; }
/** Let op: geeft de laatst weggeschreven versie. Roep eerst flush() aan als je die nodig hebt. */
export function getEnvelope() { requireUnlocked(); return envelope; }
export function getDataKey() { requireUnlocked(); return dataKey; }

function newKdf() {
  return { name: 'PBKDF2-SHA256', iterations: APP.kdfIterations, salt: c.bytesToB64(c.randomBytes(16)) };
}

async function openEnvelope(env, password) {
  validateEnvelope(env);
  const kek = await c.passwordKey(password, c.b64ToBytes(env.kdf.salt), env.kdf.iterations);
  let key;
  try { key = await c.unwrapDataKey(env.wrappedKey, kek); } catch { throw new WrongPasswordError(); }
  const plain = await c.decryptJSON(env.payload, key);
  return { key, plain };
}

function installEnvelope(env, key, plain) {
  envelope = env; dataKey = key; data = plain;
  revision++;
  persistedRevision = revision;
}

// ---------- Aanmaken / openen / sluiten ----------

export async function create(password, initialData) {
  const kdf = newKdf();
  const kek = await c.passwordKey(password, c.b64ToBytes(kdf.salt), kdf.iterations);
  dataKey = await c.generateDataKey();
  data = initialData;
  envelope = {
    format: FORMAT, version: FORMAT_VERSION, kdf,
    wrappedKey: await c.wrapDataKey(dataKey, kek), payload: null, updatedAt: 0,
  };
  revision++;
  setSyncMeta({ sha: null, dirty: true });
  await persist({ reencrypt: true });
}

export async function unlockWithPassword(password) {
  await flush();
  const env = load(KEYS.vault);
  const { key, plain } = await openEnvelope(env, password);
  installEnvelope(env, key, plain);
}

export async function unlockWithKey(key) {
  await flush();
  const env = load(KEYS.vault);
  validateEnvelope(env);
  installEnvelope(env, key, await c.decryptJSON(env.payload, key));
}

/** Bestaande kluis (bijv. van GitHub) op dit apparaat installeren. */
export async function importEnvelope(env, password) {
  const { key, plain } = await openEnvelope(env, password);
  await flush();
  save(KEYS.vault, env);
  installEnvelope(env, key, plain);
}

/** Back-up terugzetten. Overschrijft daarna ook de versie op GitHub. */
export async function restoreBackup(env, password) {
  requireUnlocked();
  const { key, plain } = await openEnvelope(env, password);
  const sameKey = await c.sameKey(key, dataKey);
  await flush();
  save(KEYS.vault, env);
  installEnvelope(env, key, plain);
  updateSyncMeta({ dirty: true, keyDirty: true, force: true });
  return { sameKey };
}

/**
 * Een ander tabblad heeft de kluis gewijzigd: opnieuw inlezen.
 * Geeft false (en vergrendelt) als dat met de huidige sleutel niet lukt.
 */
export async function reloadFromStorage() {
  if (!dataKey) return false;
  await flush();
  const env = load(KEYS.vault);
  try {
    validateEnvelope(env);
    installEnvelope(env, dataKey, await c.decryptJSON(env.payload, dataKey));
    return true;
  } catch {
    lock();
    return false;
  }
}

export function lock() {
  dataKey = null; data = null;
}

/** Wist alles van deze app op dit apparaat (niet op GitHub). */
export async function reset() {
  await flush();
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(`${P}:`)) localStorage.removeItem(k);
  }
  lock();
  envelope = null;
}

// ---------- Wijzigen ----------

export async function setData(next) {
  requireUnlocked();
  data = next;
  revision++;
  updateSyncMeta({ dirty: true });
  await persist({ reencrypt: true });
}

export async function changePassword(current, next) {
  requireUnlocked();
  await openEnvelope(envelope, current); // controleert huidig wachtwoord
  const kdf = newKdf();
  const kek = await c.passwordKey(next, c.b64ToBytes(kdf.salt), kdf.iterations);
  const wrappedKey = await c.wrapDataKey(dataKey, kek);
  envelope = { ...envelope, kdf, wrappedKey, updatedAt: Date.now() };
  revision++;
  updateSyncMeta({ dirty: true, keyDirty: true });
  await persist({ reencrypt: false });
}

// ---------- Sync-ondersteuning ----------

export async function decryptRemote(env) {
  requireUnlocked();
  validateEnvelope(env);
  try {
    return await c.decryptJSON(env.payload, dataKey);
  } catch {
    throw new Error('Het bestand op GitHub is met een andere sleutel versleuteld. Controleer het pad, of wis dit apparaat en koppel opnieuw.');
  }
}

/** Neemt de remote versie over (incl. wachtwoordwijziging van een ander apparaat). */
export async function adoptRemote(env, nextData, sha, { keepLocal }) {
  requireUnlocked();
  const meta = getSyncMeta();
  envelope = meta.keyDirty
    ? { ...env, kdf: envelope.kdf, wrappedKey: envelope.wrappedKey } // lokale wachtwoordwijziging wint
    : { ...env };
  data = nextData;
  revision++;
  updateSyncMeta({ sha, dirty: keepLocal });
  await persist({ reencrypt: keepLocal });
}

export function markSynced(sha, uploadedRevision) {
  const stillDirty = revision !== uploadedRevision;
  const meta = getSyncMeta();
  updateSyncMeta({
    sha, dirty: stillDirty, keyDirty: stillDirty && meta.keyDirty, force: false, lastSyncAt: Date.now(),
  });
}

export function getSyncMeta() {
  return { sha: null, dirty: false, keyDirty: false, force: false, lastSyncAt: null, ...load(KEYS.sync) };
}
export const setSyncMeta = (meta) => save(KEYS.sync, meta);
export const updateSyncMeta = (patch) => save(KEYS.sync, { ...getSyncMeta(), ...patch });

// ---------- Apparaatinstellingen (versleuteld, worden NIET gesynchroniseerd) ----------

export async function getDeviceSettings() {
  requireUnlocked();
  const box = load(KEYS.device);
  if (!box) return null;
  try { return await c.decryptJSON(box, dataKey); } catch { return null; }
}

export async function setDeviceSettings(settings) {
  requireUnlocked();
  save(KEYS.device, await c.encryptJSON(settings, dataKey));
}
