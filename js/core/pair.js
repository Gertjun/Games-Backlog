// Apparaatkoppeling: v2 (PIN-beveiligde sync-configuratie) en v3 (volledige toegang).
// V3 is een bearer credential: bezit van de code geeft toegang tot de sleutel en token.
// De vervaltijd en replaycontrole zijn app-beleid, geen intrekking van gekopieerde geheimen.

import { randomBytes } from './crypto.js';

const FORMAT = 'pwa-core-pairing';
const VERSION = 2;
const PREFIX = 'PWA-CORE-PAIR-2:';
const LEGACY_PREFIXES = ['PWK1.', 'PWK2.', 'PWA-CORE-PAIR-1:', 'CPK1.', 'CPK2.'];
const PIN_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PIN_LENGTH = 16;
const TTL_MS = 3 * 60 * 1000;
const KDF_ITERATIONS = 600000;
const MAX_PLAINTEXT_BYTES = 12000;
const MAX_TEXT_CODE_CHARS = 24000;
const MAX_QR_CODE_CHARS = 2200;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error(`De koppelcode bevat een ongeldige ${label}.`);
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  let binary;
  try { binary = atob(padded); } catch { throw new Error(`De koppelcode bevat een ongeldige ${label}.`); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validateContext(context) {
  if (typeof context !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(context)) {
    throw new TypeError('context moet een vaste app-identificatie van 1–128 veilige tekens zijn.');
  }
}

export function normalizePin(pin) {
  return String(pin ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function validatePin(pin) {
  const normalized = normalizePin(pin);
  if (normalized.length !== PIN_LENGTH || [...normalized].some((character) => !PIN_CHARS.includes(character))) {
    throw new TypeError('De pincode moet 16 tekens bevatten, bijvoorbeeld AB3D-7KMP-9Q2R-5TUV.');
  }
  return normalized;
}

/** Genereert een uniforme 16-teken-PIN met rejection sampling (geen modulo-bias). */
export function newPin() {
  let result = '';
  const limit = Math.floor(256 / PIN_CHARS.length) * PIN_CHARS.length;
  while (result.length < PIN_LENGTH) {
    for (const value of randomBytes(32)) {
      if (value >= limit) continue;
      result += PIN_CHARS[value % PIN_CHARS.length];
      if (result.length === PIN_LENGTH) break;
    }
  }
  return result.match(/.{4}/g).join('-');
}

function encodePin(pin) {
  return encoder.encode(validatePin(pin));
}

async function derivePairingKey(pin, salt) {
  const material = encodePin(pin);
  try {
    const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: KDF_ITERATIONS },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    material.fill(0);
  }
}

function additionalData(context, issuedAt, expiresAt) {
  return encoder.encode(`${FORMAT}|${VERSION}|${context}|${issuedAt}|${expiresAt}`);
}

const SYNC_CONFIG_FIELDS = ['owner', 'repo', 'branch', 'path', 'token'];

function validateSyncConfig(syncConfig) {
  if (!syncConfig || typeof syncConfig !== 'object' || Array.isArray(syncConfig) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(syncConfig))) {
    throw new TypeError('De over te dragen GitHub Sync-configuratie moet een JSON-object zijn.');
  }
  const keys = Object.keys(syncConfig).sort();
  if (keys.length !== SYNC_CONFIG_FIELDS.length ||
      keys.some((key, index) => key !== [...SYNC_CONFIG_FIELDS].sort()[index])) {
    throw new TypeError('De GitHub Sync-configuratie mag uitsluitend owner, repo, branch, path en token bevatten.');
  }
  for (const field of SYNC_CONFIG_FIELDS) {
    const value = syncConfig[field];
    if (typeof value !== 'string' || !value.trim() || value.length > 4096) {
      throw new TypeError(`Ongeldige GitHub Sync-configuratie: ${field} moet een tekstwaarde van 1–4096 tekens zijn.`);
    }
  }
}

function validatePairingId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

function maxCodeLength(transport) {
  if (transport === 'text') return MAX_TEXT_CODE_CHARS;
  if (transport === 'qr') return MAX_QR_CODE_CHARS;
  throw new TypeError('transport moet text of qr zijn.');
}

/**
 * Maakt één protocolenvelop voor iedere transportvorm.
 * Alleen de minimale synchronisatieconfiguratie wordt overgedragen; applicatiedata hoort hier niet thuis.
 * transport='qr' hanteert de kleinere QR-limiet; 'text' staat een grotere handmatige code toe.
 */
export async function createPairingCode({
  syncConfig, pin, context, now = Date.now(), transport = 'text',
} = {}) {
  validateContext(context);
  validateSyncConfig(syncConfig);
  const maxChars = maxCodeLength(transport);
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Ongeldig tijdstip.');

  const issuedAt = now;
  const expiresAt = issuedAt + TTL_MS;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const pairingId = bytesToBase64Url(randomBytes(24));
  const plaintext = encoder.encode(JSON.stringify({
    format: FORMAT, version: VERSION, context, issuedAt, expiresAt, pairingId, syncConfig,
  }));
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    plaintext.fill(0);
    throw new Error('De koppelgegevens zijn te groot voor een veilige overdracht.');
  }

  let ciphertext;
  try {
    const key = await derivePairingKey(pin, salt);
    ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(context, issuedAt, expiresAt), tagLength: 128 },
      key,
      plaintext,
    );
  } finally {
    plaintext.fill(0);
  }

  const envelope = {
    format: FORMAT, version: VERSION, context, issuedAt, expiresAt,
    salt: bytesToBase64Url(salt), iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
  const payload = PREFIX + bytesToBase64Url(encoder.encode(JSON.stringify(envelope)));
  if (payload.length > maxChars) {
    throw new Error(transport === 'qr'
      ? 'De koppelgegevens zijn te groot voor één QR-code. Gebruik de handmatige koppelcode.'
      : 'De handmatige koppelcode is te groot.');
  }
  return { payload, pairingId, issuedAt, expiresAt };
}

/** Ontsleutelt en valideert de Core-envelop; past zelf geen app-instellingen of data toe. */
export async function openPairingCode({
  payload, pin, context, now = Date.now(), transport = 'text',
} = {}) {
  validateContext(context);
  const maxChars = maxCodeLength(transport);
  if (typeof payload !== 'string') throw new TypeError('De koppelcode moet tekst zijn.');
  if (payload.length > maxChars * 2) throw new Error('Dit is geen geldige PWA-Core-koppelcode.');
  const text = payload.trim().replace(/\s+/g, '');
  if (LEGACY_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    throw new Error('Deze oude koppelcode wordt niet meer geaccepteerd. Maak op het andere apparaat een nieuwe code.');
  }
  if (!text.startsWith(PREFIX) || text.length > maxChars) {
    throw new Error('Dit is geen geldige PWA-Core-koppelcode.');
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Ongeldig tijdstip.');

  let envelope;
  try {
    envelope = JSON.parse(decoder.decode(base64UrlToBytes(text.slice(PREFIX.length), 'inhoud')));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('De koppelcode bevat')) throw error;
    throw new Error('De koppelcode is beschadigd of onvolledig.');
  }

  if (envelope?.format !== FORMAT || envelope.version !== VERSION ||
      envelope.context !== context ||
      !Number.isSafeInteger(envelope.issuedAt) || !Number.isSafeInteger(envelope.expiresAt)) {
    throw new Error('Deze koppelcode is ongeldig of hoort bij een andere app.');
  }
  if (envelope.expiresAt <= now || now - envelope.issuedAt > TTL_MS) {
    throw new Error('Deze koppelcode is verlopen. Maak op het andere apparaat een nieuwe code.');
  }
  if (envelope.issuedAt > now + 30000 || envelope.expiresAt - envelope.issuedAt !== TTL_MS) {
    throw new Error('De geldigheidsduur van deze koppelcode klopt niet.');
  }

  const salt = base64UrlToBytes(envelope.salt, 'salt');
  const iv = base64UrlToBytes(envelope.iv, 'initialisatievector');
  const ciphertext = base64UrlToBytes(envelope.ciphertext, 'versleutelde inhoud');
  if (salt.length !== 16 || iv.length !== 12 ||
      ciphertext.length < 17 || ciphertext.length > MAX_PLAINTEXT_BYTES + 16) {
    throw new Error('De koppelcode heeft een ongeldige inhoud.');
  }

  const key = await derivePairingKey(pin, salt);
  let plaintext;
  let decoded;
  try {
    plaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(context, envelope.issuedAt, envelope.expiresAt), tagLength: 128 },
      key,
      ciphertext,
    ));
    decoded = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('De pincode klopt niet of de code is beschadigd.');
  } finally {
    plaintext?.fill(0);
  }

  if (decoded?.format !== FORMAT || decoded.version !== VERSION ||
      decoded.context !== context || decoded.issuedAt !== envelope.issuedAt ||
      decoded.expiresAt !== envelope.expiresAt || !validatePairingId(decoded.pairingId)) {
    throw new Error('De ontsleutelde koppelgegevens zijn ongeldig.');
  }
  validateSyncConfig(decoded.syncConfig);
  return {
    syncConfig: decoded.syncConfig,
    pairingId: decoded.pairingId,
    issuedAt: decoded.issuedAt,
    expiresAt: decoded.expiresAt,
  };
}

/**
 * Controleert zonder te schrijven of een pairing-ID op dit apparaat al is gebruikt.
 * Zo kan een app eerst de volledige koppeling uitvoeren en pas daarna markPairingUsed aanroepen.
 * Fail-closed: beschadigde of ongeldige replayhistorie wordt geweigerd.
 */
export function assertPairingNotUsed(storage, pairingId, {
  storageKey = 'pwa-core:device-pairing:used', now = Date.now(),
} = {}) {
  if (!storage || typeof storage.getItem !== 'function') {
    throw new Error('Lokale opslag voor replaybescherming is niet beschikbaar.');
  }
  if (!validatePairingId(pairingId)) throw new TypeError('Ongeldige pairing-ID.');
  if (typeof storageKey !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(storageKey)) {
    throw new TypeError('Ongeldige opslagnaam voor replaybescherming.');
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Ongeldig tijdstip.');
  const stored = storage.getItem(storageKey);
  if (stored === null) return;
  let entries;
  try { entries = JSON.parse(stored); }
  catch { throw new Error('De lokale replayhistorie is beschadigd; koppelen wordt geweigerd.'); }
  if (!Array.isArray(entries) || entries.some((entry) =>
    !entry || !validatePairingId(entry.pairingId) ||
    !Number.isSafeInteger(entry.usedAt) || entry.usedAt < 0)) {
    throw new Error('De lokale replayhistorie is ongeldig; koppelen wordt geweigerd.');
  }
  if (entries.some((entry) => entry.pairingId === pairingId &&
    now - entry.usedAt <= 10 * 60 * 1000 && entry.usedAt <= now + 30000)) {
    throw new Error('Deze koppelcode is op dit apparaat al gebruikt. Maak een nieuwe code.');
  }
}

/** Lokale replayregistratie; zonder server is dit geen globale eenmaligheid. */
export function markPairingUsed(storage, pairingId, {
  storageKey = 'pwa-core:device-pairing:used', now = Date.now(),
} = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('Lokale opslag voor replaybescherming is niet beschikbaar.');
  }
  if (!validatePairingId(pairingId)) throw new TypeError('Ongeldige pairing-ID.');
  if (typeof storageKey !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(storageKey)) {
    throw new TypeError('Ongeldige opslagnaam voor replaybescherming.');
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Ongeldig tijdstip.');

  let entries = [];
  const stored = storage.getItem(storageKey);
  if (stored !== null) {
    try { entries = JSON.parse(stored); }
    catch { throw new Error('De lokale replayhistorie is beschadigd; deze wordt niet automatisch gewist.'); }
    if (!Array.isArray(entries) || entries.some((entry) =>
      !entry || !validatePairingId(entry.pairingId) ||
      !Number.isSafeInteger(entry.usedAt) || entry.usedAt < 0)) {
      throw new Error('De lokale replayhistorie is ongeldig; deze wordt niet automatisch gewist.');
    }
  }

  entries = entries.filter((entry) => now - entry.usedAt <= 10 * 60 * 1000 && entry.usedAt <= now + 30000);
  if (entries.some((entry) => entry.pairingId === pairingId)) {
    throw new Error('Deze koppelcode is op dit apparaat al gebruikt. Maak een nieuwe code.');
  }
  entries.push({ pairingId, usedAt: now });
  storage.setItem(storageKey, JSON.stringify(entries.slice(-32)));
}

export const PAIRING_TTL_MS = TTL_MS;
export const PAIRING_KDF_ITERATIONS = KDF_ITERATIONS;
export const PAIRING_PIN_LENGTH = PIN_LENGTH;
export const PAIRING_TEXT_MAX_CHARS = MAX_TEXT_CODE_CHARS;
export const PAIRING_QR_MAX_CHARS = MAX_QR_CODE_CHARS;


// V3: een zelfstandige overdrachtscode voor een expliciet geautoriseerde koppeling.
// De code is geheim, niet versleuteld tegen iemand die de code bezit.
// Gebruik uitsluitend een URL-fragment (nooit query parameters) voor dit protocol.
export const FULL_PAIRING_PREFIX = 'PWA-CORE-PAIR-3:';

export async function createFullPairingCode({
  syncConfig, dataKey, context, now = Date.now(), transport = 'text',
} = {}) {
  validateContext(context);
  validateSyncConfig(syncConfig);
  const maxChars = maxCodeLength(transport);
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + TTL_MS)) {
    throw new TypeError('Ongeldig tijdstip.');
  }
  if (dataKey?.type !== 'secret' || dataKey.algorithm?.name !== 'AES-GCM' ||
      dataKey.algorithm.length !== 256 || !dataKey.extractable ||
      !dataKey.usages.includes('encrypt') || !dataKey.usages.includes('decrypt')) {
    throw new TypeError('Ongeldige kluissleutel.');
  }
  const pairingId = bytesToBase64Url(randomBytes(24));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dataKey));
  try {
    const issuedAt = now;
    const expiresAt = now + TTL_MS;
    const body = encoder.encode(JSON.stringify({
      format: FORMAT, version: 3, context, issuedAt, expiresAt, pairingId,
      syncConfig, dataKey: bytesToBase64Url(raw),
    }));
    try {
      const payload = FULL_PAIRING_PREFIX + bytesToBase64Url(body);
      if (body.length > MAX_PLAINTEXT_BYTES || payload.length > maxChars) {
        throw new Error(transport === 'qr'
          ? 'De koppelgegevens zijn te groot voor één QR-code. Gebruik de handmatige koppelcode.'
          : 'De handmatige koppelcode is te groot.');
      }
      return { payload, pairingId, issuedAt, expiresAt };
    } finally {
      body.fill(0);
    }
  } finally {
    raw.fill(0);
  }
}

export async function openFullPairingCode({
  payload, context, now = Date.now(), transport = 'text',
} = {}) {
  validateContext(context);
  const maxChars = maxCodeLength(transport);
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Ongeldig tijdstip.');
  if (typeof payload !== 'string' || payload.length > maxChars * 2) {
    throw new Error('Dit is geen geldige PWA-Core-koppelcode.');
  }
  const text = payload.trim().replace(/\s+/g, '');
  if (!text.startsWith(FULL_PAIRING_PREFIX) || text.length > maxChars) {
    throw new Error('Dit is geen geldige PWA-Core-koppelcode.');
  }
  let decoded;
  let body;
  try {
    body = base64UrlToBytes(text.slice(FULL_PAIRING_PREFIX.length), 'inhoud');
    if (body.length > MAX_PLAINTEXT_BYTES) throw new Error('Te groot');
    decoded = JSON.parse(decoder.decode(body));
  } catch {
    throw new Error('De koppelcode is beschadigd of onvolledig.');
  } finally {
    body?.fill(0);
  }
  const fields = ['format', 'version', 'context', 'issuedAt', 'expiresAt', 'pairingId', 'syncConfig', 'dataKey'];
  if (!decoded || Object.keys(decoded).length !== fields.length ||
      fields.some(field => !Object.hasOwn(decoded, field)) ||
      decoded.format !== FORMAT || decoded.version !== 3 || decoded.context !== context ||
      !validatePairingId(decoded.pairingId) ||
      !Number.isSafeInteger(decoded.issuedAt) || decoded.issuedAt < 0 ||
      !Number.isSafeInteger(decoded.expiresAt)) {
    throw new Error('Deze koppelcode is ongeldig of hoort bij een andere app.');
  }
  if (decoded.expiresAt <= now || now - decoded.issuedAt > TTL_MS) {
    throw new Error('Deze koppelcode is verlopen. Maak op het andere apparaat een nieuwe code.');
  }
  if (decoded.issuedAt > now + 30000 || decoded.expiresAt - decoded.issuedAt !== TTL_MS) {
    throw new Error('De geldigheidsduur van deze koppelcode klopt niet.');
  }
  validateSyncConfig(decoded.syncConfig);
  const raw = base64UrlToBytes(decoded.dataKey, 'kluissleutel');
  try {
    if (raw.length !== 32) throw new Error('Ongeldige kluissleutel.');
    const dataKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    return { syncConfig: decoded.syncConfig, dataKey, pairingId: decoded.pairingId,
      issuedAt: decoded.issuedAt, expiresAt: decoded.expiresAt };
  } finally {
    raw.fill(0);
  }
}
