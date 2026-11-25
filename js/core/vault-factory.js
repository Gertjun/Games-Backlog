// Factory voor volledig geïsoleerde kluisinstanties.
import * as c from './crypto.js';
import { SYSTEM_KEY, collectDeletions, mergeSyncStates, registerDevice, acknowledgeDeletions, deactivateDevice, reconcileData, reconcileBackup, applyDeletionLedger } from './deletions.js';

const activePrefixes = new Set();
const MIN_KDF_ITERATIONS = 100_000;
const MAX_KDF_ITERATIONS = 2_000_000;

export class DuplicateVaultInstanceError extends Error {
  constructor(prefix) { super(`Er bestaat al een kluisinstantie voor opslagprefix "${prefix}" in deze runtime.`); this.name = 'DuplicateVaultInstanceError'; }
}

export function createVault({ storagePrefix, kdfIterations, storage = globalThis.localStorage } = {}) {
  if (typeof storagePrefix !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(storagePrefix)) throw new TypeError('storagePrefix moet één stabiel namespace-segment zijn (letters, cijfers, punt, underscore of koppelteken; geen dubbele punt).');
  if (!Number.isSafeInteger(kdfIterations) || kdfIterations < MIN_KDF_ITERATIONS || kdfIterations > MAX_KDF_ITERATIONS) {
    throw new TypeError('kdfIterations moet tussen ' + MIN_KDF_ITERATIONS + ' en ' + MAX_KDF_ITERATIONS + ' liggen.');
  }
  if (!storage || !Number.isInteger(storage.length) || !['getItem','setItem','removeItem','key'].every((key) => typeof storage[key] === 'function')) throw new TypeError('storage voldoet niet aan het Storage-contract.');
  const P = storagePrefix;
  if (activePrefixes.has(P)) throw new DuplicateVaultInstanceError(P);
  activePrefixes.add(P);
  let disposed = false;
  const assertActive = () => { if (disposed) throw new Error('Deze kluisinstantie is vrijgegeven.'); };
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


const KEYS = { vault: `${P}:vault`, device: `${P}:device`, sync: `${P}:sync` };
const FORMAT = 'pwa-vault';
const FORMAT_VERSION = 1;

let dataKey = null;
let data = null;
let envelope = null;
let revision = 0;          // telt lokale wijzigingen
let persistedRevision = 0; // welke wijziging nu in `envelope` staat
let queue = Promise.resolve();
const writeErrors = new Map();
let lastWriteError = null;

class WrongPasswordError extends Error {
  constructor() { super('Onjuist wachtwoord.'); this.name = 'WrongPasswordError'; }
}

function load(key) {
  assertActive();
  const raw = storage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function save(key, value) {
  assertActive();
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err?.name === 'QuotaExceededError') throw new Error('De opslag op dit apparaat is vol.');
    throw err;
  }
}

function requireUnlocked() {
  assertActive();
  if (!dataKey) throw new Error('De kluis is vergrendeld.');
}

function enqueue(job, writeRevision) {
  const run = queue.then(job);
  queue = run.catch((err) => {
    if (Number.isInteger(writeRevision)) writeErrors.set(writeRevision, err);
    lastWriteError = err;
    console.error('Opslaan mislukt:', err?.name || 'Error');
  });
  return run;
}

class StorageWriteError extends Error {
  constructor(targetRevision, cause) {
    super(`Opslag van revisie ${targetRevision} is niet bevestigd.`, { cause });
    this.name = 'StorageWriteError';
    this.targetRevision = targetRevision;
  }
}

/**
 * Bevestigt dat de revisie die bij aanroep actueel was duurzaam lokaal is opgeslagen.
 * Een latere volledige snapshot mag eerdere mislukte writes inhalen.
 */
async function flush() {
  assertActive();
  const targetRevision = revision;
  await queue;
  if (persistedRevision >= targetRevision) {
    for (const rev of writeErrors.keys()) if (rev <= persistedRevision) writeErrors.delete(rev);
    if (!writeErrors.size) lastWriteError = null;
    return { revision: persistedRevision };
  }
  const failure = [...writeErrors.entries()]
    .filter(([rev]) => rev <= targetRevision)
    .sort((a, b) => b[0] - a[0])[0]?.[1] || lastWriteError || new Error('Geen opslagbevestiging ontvangen.');
  throw new StorageWriteError(targetRevision, failure);
}

/** Geeft uitsluitend niet-gevoelige metadata over de lokale schrijfwachtrij. */
function getStorageStatus() {
  assertActive();
  return {
    requestedRevision: revision,
    persistedRevision,
    pending: persistedRevision < revision,
    lastError: lastWriteError ? {
      name: lastWriteError.name || 'Error',
      message: /quota|opslag.*vol/i.test(lastWriteError.name || lastWriteError.message || '')
        ? 'De opslag op dit apparaat is vol.'
        : 'Opslaan is mislukt.',
    } : null,
  };
}

/**
 * Probeert één volledige actuele snapshot opnieuw op te slaan.
 * Er is bewust geen automatische retry-loop.
 */
async function retryFlush() {
  requireUnlocked();
  if (persistedRevision < revision) await persist({ reencrypt: true });
  return flush();
}

/** Schrijft een volledige, geïsoleerde snapshot weg via de seriële wachtrij. */
function persist({ reencrypt }) {
  const snapData = structuredClone(data);
  const snapKey = dataKey;
  const snapEnvelope = structuredClone(envelope);
  const snapRev = revision;
  return enqueue(async () => {
    const nextEnvelope = reencrypt
      ? { ...snapEnvelope, payload: await c.encryptJSON(snapData, snapKey), updatedAt: Date.now() }
      : snapEnvelope;
    save(KEYS.vault, nextEnvelope);
    envelope = nextEnvelope;
    persistedRevision = Math.max(persistedRevision, snapRev);
    for (const rev of writeErrors.keys()) if (rev <= persistedRevision) writeErrors.delete(rev);
    if (!writeErrors.size) lastWriteError = null;
  }, snapRev);
}

function validateEnvelope(env) {
  if (!env || env.format !== FORMAT || !env.kdf || !env.wrappedKey || !env.payload) {
    throw new Error('Dit is geen geldig kluisbestand.');
  }
  if (env.version > FORMAT_VERSION) {
    throw new Error('Dit kluisbestand is gemaakt met een nieuwere versie van de app. Werk de app eerst bij.');
  }
  if (env.version !== FORMAT_VERSION) throw new Error('Dit is geen geldig kluisbestand.');
  if (env.kdf.name !== 'PBKDF2-SHA256' || !Number.isSafeInteger(env.kdf.iterations) ||
      env.kdf.iterations < MIN_KDF_ITERATIONS || env.kdf.iterations > MAX_KDF_ITERATIONS) {
    throw new Error('Dit kluisbestand heeft onveilige of ongeldige wachtwoordinstellingen.');
  }
  let salt;
  try { salt = c.b64ToBytes(env.kdf.salt); } catch { /* hieronder afgewezen */ }
  if (!(salt instanceof Uint8Array) || salt.length !== 16) {
    throw new Error('Dit kluisbestand heeft een ongeldige wachtwoordsalt.');
  }
}

const hasVault = () => load(KEYS.vault) !== null;
const isUnlocked = () => dataKey !== null;
const getRevision = () => revision;
const getPersistedRevision = () => persistedRevision;
function getData() { requireUnlocked(); return data; }
/** Geeft de huidige envelop in geheugen. Roep eerst flush() aan voor opslagbevestiging. */
function getEnvelope() { requireUnlocked(); return envelope; }

/**
 * Maakt een versleutelde recovery-envelop van de actuele geheugenstand zonder
 * storage te wijzigen. Bedoeld voor herstel bij een externe storage-conflict.
 */
async function createRecoveryEnvelope() {
  requireUnlocked();
  return {
    ...structuredClone(envelope),
    payload: await c.encryptJSON(structuredClone(data), dataKey),
    updatedAt: Date.now(),
  };
}

/** Maakt een versleutelde export van device-settings zonder storage te wijzigen. */
async function createDeviceSettingsRecovery(value) {
  requireUnlocked();
  return c.encryptJSON(structuredClone(value), dataKey);
}
function getDataKey() { requireUnlocked(); return dataKey; }

function newKdf() {
  return { name: 'PBKDF2-SHA256', iterations: kdfIterations, salt: c.bytesToB64(c.randomBytes(16)) };
}

async function openEnvelope(env, password) {
  validateEnvelope(env);
  const kek = await c.passwordKey(password, c.b64ToBytes(env.kdf.salt), env.kdf.iterations);
  let key;
  try { key = await c.unwrapDataKey(env.wrappedKey, kek); } catch { throw new WrongPasswordError(); }
  const plain = await c.decryptJSON(env.payload, key);
  return { key, plain };
}

function installEnvelope(env, key, plain, { persisted = true } = {}) {
  envelope = env; dataKey = key; data = plain;
  revision++;
  if (persisted) {
    persistedRevision = revision;
    writeErrors.clear();
    lastWriteError = null;
  }
}

// ---------- Aanmaken / openen / sluiten ----------

async function create(password, initialData) {
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

async function unlockWithPassword(password) {
  await flush();
  const env = load(KEYS.vault);
  const { key, plain } = await openEnvelope(env, password);
  installEnvelope(env, key, plain);
}

async function unlockWithKey(key) {
  await flush();
  const env = load(KEYS.vault);
  validateEnvelope(env);
  installEnvelope(env, key, await c.decryptJSON(env.payload, key));
}

/** Bestaande kluis (bijv. van GitHub) op dit apparaat installeren. */
async function importEnvelope(env, password) {
  const { key, plain } = await openEnvelope(env, password);
  await flush();
  save(KEYS.vault, env);
  installEnvelope(env, key, plain);
}

/** Importeert uitsluitend in een lege kluis, met een reeds geautoriseerde datasleutel.
 * De aanroeper moet de exclusieve app-sessielock bezitten.
 */
async function importEnvelopeWithKey(env, key, { deviceSettings, syncMeta } = {}) {
  assertActive();
  if (key?.type !== 'secret' || key.algorithm?.name !== 'AES-GCM' ||
      key.algorithm.length !== 256 || !key.extractable ||
      !key.usages.includes('encrypt') || !key.usages.includes('decrypt')) {
    throw new TypeError('Ongeldige kluissleutel.');
  }
  const assertEmpty = () => {
    if (isUnlocked() || storage.getItem(KEYS.vault) !== null) {
      throw new Error('Op dit apparaat bestaat al een kluis.');
    }
  };
  assertEmpty();
  const snapshot = structuredClone(env);
  validateEnvelope(snapshot);
  const plain = await c.decryptJSON(snapshot.payload, key);
  const deviceBox = deviceSettings === undefined ? undefined : await c.encryptJSON(deviceSettings, key);
  const meta = syncMeta === undefined ? undefined : structuredClone(syncMeta);
  await flush();
  assertActive();
  assertEmpty();
  // Commit the vault last. Until then a failed setup can be retried.
  // Preserve any pre-existing auxiliary records, even if corrupt.
  const changes = [
    ...(deviceBox === undefined ? [] : [[KEYS.device, deviceBox]]),
    ...(meta === undefined ? [] : [[KEYS.sync, meta]]),
  ];
  const previous = changes.map(([name]) => [name, storage.getItem(name)]);
  let written = 0;
  try {
    for (const [name, value] of changes) {
      save(name, value);
      written++;
    }
    save(KEYS.vault, snapshot);
  } catch (error) {
    // Storage.setItem is atomic per key; a failing write does not change it.
    // A rollback failure leaves only auxiliary records, never a new vault.
    for (const [name, raw] of previous.slice(0, written).reverse()) {
      try {
        if (raw === null) storage.removeItem(name);
        else storage.setItem(name, raw);
      } catch {
        throw new Error('Koppeling niet voltooid; lokale hulpinstellingen konden niet volledig worden hersteld. Probeer opnieuw.', { cause: error });
      }
    }
    throw error;
  }
  installEnvelope(snapshot, key, plain);
}

/** Back-up terugzetten. Overschrijft daarna ook de versie op GitHub. */
async function restoreBackup(env, password) {
  requireUnlocked();
  const { key, plain } = await openEnvelope(env, password);
  const sameKey = await c.sameKey(key, dataKey);
  await flush();
  // Bewaar de verwijdergeschiedenis van de huidige kluis vóór de back-up wordt geïnstalleerd.
  const safePlain = reconcileBackup(plain, data);
  installEnvelope(env, key, safePlain, { persisted: false });
  updateSyncMeta({ dirty: true, keyDirty: true, force: true });
  await persist({ reencrypt: true });
  return { sameKey };
}

/**
 * Een ander tabblad heeft de kluis gewijzigd: opnieuw inlezen.
 * Geeft false (en vergrendelt) als dat met de huidige sleutel niet lukt.
 */
async function reloadFromStorage() {
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

function lock() {
  dataKey = null; data = null;
}

/** Wist alles van deze app op dit apparaat (niet op GitHub). */
async function reset() {
  await flush();
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key) => key?.startsWith(`${P}:`));
  for (const key of keys) storage.removeItem(key);
  lock();
  envelope = null;
}

// ---------- Wijzigen ----------

async function setData(next) {
  requireUnlocked();
  data = next;
  revision++;
  updateSyncMeta({ dirty: true });
  await persist({ reencrypt: true });
}

async function changePassword(current, next) {
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

async function decryptRemote(env) {
  requireUnlocked();
  validateEnvelope(env);
  try {
    return await c.decryptJSON(env.payload, dataKey);
  } catch {
    throw new Error('Het bestand op GitHub is met een andere sleutel versleuteld. Controleer het pad, of wis dit apparaat en koppel opnieuw.');
  }
}

/** Neemt de remote versie over (incl. wachtwoordwijziging van een ander apparaat). */
async function adoptRemote(env, nextData, sha, { keepLocal }) {
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

function markSynced(sha, uploadedRevision) {
  const stillDirty = revision !== uploadedRevision;
  const meta = getSyncMeta();
  updateSyncMeta({
    sha, dirty: stillDirty, keyDirty: stillDirty && meta.keyDirty, force: false, lastSyncAt: Date.now(),
  });
}

function getSyncMeta() {
  return { sha: null, dirty: false, keyDirty: false, force: false, lastSyncAt: null, ...load(KEYS.sync) };
}
const setSyncMeta = (meta) => save(KEYS.sync, meta);
const updateSyncMeta = (patch) => save(KEYS.sync, { ...getSyncMeta(), ...patch });


const DEVICE_ID_KEY = `${P}:device-id`;
function getDeviceId() {
  let id = storage.getItem(DEVICE_ID_KEY);
  if (!id) { id = crypto.randomUUID(); storage.setItem(DEVICE_ID_KEY, id); }
  return id;
}
async function captureDeletionHistory() {
  requireUnlocked();
  const deletions = collectDeletions(data);
  const state = mergeSyncStates(data[SYSTEM_KEY], null);
  const before = JSON.stringify(state.deletions);
  for (const [key, time] of Object.entries(deletions)) state.deletions[key] = Math.max(Number(state.deletions[key]) || 0, Number(time) || 0);
  if (before !== JSON.stringify(state.deletions)) {
    data = { ...data, [SYSTEM_KEY]: state }; revision++;
    updateSyncMeta({ dirty: true }); await persist({ reencrypt: true });
  }
}
async function prepareSyncData() {
  requireUnlocked();
  await captureDeletionHistory();
  const id = getDeviceId();
  let state = registerDevice(data[SYSTEM_KEY], id);
  for (const [key, time] of Object.entries(collectDeletions(data))) state.deletions[key] = Math.max(Number(state.deletions[key]) || 0, Number(time) || 0);
  state = acknowledgeDeletions(state, id);
  const nextData = applyDeletionLedger({ ...data, [SYSTEM_KEY]: state });
  if (JSON.stringify(nextData) !== JSON.stringify(data)) {
    data = nextData; revision++;
    updateSyncMeta({ dirty: true }); await persist({ reencrypt: true });
  }
}
function reconcileRemoteData(remoteData, migrate) {
  const raw = structuredClone(remoteData || {});
  const state = mergeSyncStates(data?.[SYSTEM_KEY], raw[SYSTEM_KEY]);
  for (const [key, time] of Object.entries(collectDeletions(raw))) state.deletions[key] = Math.max(Number(state.deletions[key]) || 0, Number(time) || 0);
  raw[SYSTEM_KEY] = state;
  const migrated = migrate(structuredClone(raw)) || {};
  migrated[SYSTEM_KEY] = mergeSyncStates(raw[SYSTEM_KEY], migrated[SYSTEM_KEY]);
  const next = reconcileBackup(migrated, data);
  next[SYSTEM_KEY] = acknowledgeDeletions(next[SYSTEM_KEY], getDeviceId());
  return next;
}
function mergeRemoteData(remoteData, migrate, appMerge) {
  const raw = structuredClone(remoteData || {});
  const state = mergeSyncStates(data?.[SYSTEM_KEY], raw[SYSTEM_KEY]);
  for (const [key, time] of Object.entries(collectDeletions(raw))) state.deletions[key] = Math.max(Number(state.deletions[key]) || 0, Number(time) || 0);
  raw[SYSTEM_KEY] = state;
  const migrated = migrate(structuredClone(raw)) || {};
  migrated[SYSTEM_KEY] = mergeSyncStates(raw[SYSTEM_KEY], migrated[SYSTEM_KEY]);
  const next = reconcileData(data, migrated, appMerge);
  next[SYSTEM_KEY] = acknowledgeDeletions(next[SYSTEM_KEY], getDeviceId());
  return next;
}
function reconcileRestoredBackup(remoteData) {
  const next = reconcileBackup(data, remoteData);
  next[SYSTEM_KEY] = acknowledgeDeletions(next[SYSTEM_KEY], getDeviceId());
  return next;
}


function getSyncDevices() {
  requireUnlocked();
  const state = data[SYSTEM_KEY] || { devices: {}, deletions: {} };
  const currentId = getDeviceId();
  const deletionKeys = Object.keys(state.deletions || {});
  const devices = Object.entries(state.devices || {}).map(([id, device]) => ({
    id,
    current: id === currentId,
    registered: true,
    createdAt: device.createdAt || null,
    lastSeenAt: device.lastSeenAt || null,
    deactivatedAt: device.deactivatedAt || null,
    acknowledgedCount: deletionKeys.filter((key) => Number(device.acknowledged?.[key]) >= Number(state.deletions[key])).length,
    deletionCount: deletionKeys.length,
  }));
  if (!devices.some((device) => device.current)) {
    devices.unshift({ id: currentId, current: true, registered: false, lastSeenAt: null, deactivatedAt: null, acknowledgedCount: 0, deletionCount: deletionKeys.length });
  }
  return devices;
}

async function deactivateSyncDevice(deviceId) {
  requireUnlocked();
  if (deviceId === getDeviceId()) throw new Error('Dit apparaat kun je hier niet afmelden. Gebruik een ander gekoppeld apparaat.');
  const state = deactivateDevice(data[SYSTEM_KEY], deviceId);
  await setData(applyDeletionLedger({ ...data, [SYSTEM_KEY]: state }));
}

// ---------- Apparaatinstellingen (versleuteld, worden NIET gesynchroniseerd) ----------

async function getDeviceSettings() {
  requireUnlocked();
  const box = load(KEYS.device);
  if (!box) return null;
  try { return await c.decryptJSON(box, dataKey); } catch { return null; }
}

async function setDeviceSettings(settings) {
  requireUnlocked();
  save(KEYS.device, await c.encryptJSON(settings, dataKey));
}


  async function dispose() {
    if (disposed) return;
    if (dataKey) await flush();
    lock();
    envelope = null;
    disposed = true;
    activePrefixes.delete(P);
  }

  return { KEYS, WrongPasswordError, StorageWriteError, flush, getStorageStatus, retryFlush, validateEnvelope, hasVault, isUnlocked, getRevision, getPersistedRevision, getData, getEnvelope, createRecoveryEnvelope, createDeviceSettingsRecovery, getDataKey, create, unlockWithPassword, unlockWithKey, importEnvelope, importEnvelopeWithKey, restoreBackup, reloadFromStorage, lock, reset, setData, changePassword, decryptRemote, adoptRemote, markSynced, getSyncMeta, setSyncMeta, updateSyncMeta, getDeviceId, captureDeletionHistory, prepareSyncData, reconcileRemoteData, mergeRemoteData, reconcileRestoredBackup, getSyncDevices, deactivateSyncDevice, getDeviceSettings, setDeviceSettings , dispose, DuplicateVaultInstanceError };
}
