// Generieke, versleutelde overdracht voor het koppelen van een nieuw apparaat.
// De module kent geen app-configuratie, kluisindeling, QR-library of netwerkservice.
// De ontvangende app valideert de ontsleutelde data en past die fail-closed toe.

import { randomBytes } from './crypto.js';

const FORMAT = 'pwa-core-device-pairing';
const VERSION = 1;
const PREFIX = 'PWA-CORE-PAIR-1:';
const TTL_MS = 3 * 60 * 1000;
const KDF_ITERATIONS = 600000;
const MAX_PAYLOAD_CHARS = 2200;
const MAX_PLAINTEXT_BYTES = 1500;
const MAX_SECRETS = 8;
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
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
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

function encodeSecrets(secrets) {
  if (!Array.isArray(secrets) || secrets.length < 1 || secrets.length > MAX_SECRETS ||
      secrets.some((secret) => typeof secret !== 'string' || !secret.length)) {
    throw new TypeError(`Geef 1 tot ${MAX_SECRETS} niet-lege koppelgeheimen op.`);
  }
  const encoded = secrets.map((secret) => encoder.encode(secret.normalize('NFC')));
  if (encoded.some((secret) => secret.length > 4096)) {
    throw new TypeError('Een koppelgeheim is ongeldig lang.');
  }
  const total = 4 + encoded.reduce((sum, secret) => sum + 4 + secret.length, 0);
  const material = new Uint8Array(total);
  const view = new DataView(material.buffer);
  view.setUint32(0, encoded.length, false);
  let offset = 4;
  for (const secret of encoded) {
    view.setUint32(offset, secret.length, false);
    offset += 4;
    material.set(secret, offset);
    offset += secret.length;
    secret.fill(0);
  }
  return material;
}

async function derivePairingKey(secrets, salt) {
  const material = encodeSecrets(secrets);
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

function validatePayloadData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(data))) {
    throw new TypeError('De over te dragen koppelgegevens moeten een object zijn.');
  }
}

function validatePairingId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

/**
 * Maakt een tijdelijke versleutelde overdracht.
 * secrets bevat alle vereiste wachtwoorden/geheimen in een vaste, door de app bepaalde volgorde.
 * context bindt de code aan één app/protocoldoel en moet op beide apparaten gelijk zijn.
 */
export async function createPairingPayload({ data, secrets, context, now = Date.now() } = {}) {
  validateContext(context);
  validatePayloadData(data);
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Ongeldig tijdstip.');

  const issuedAt = now;
  const expiresAt = issuedAt + TTL_MS;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const pairingId = bytesToBase64Url(randomBytes(24));
  const key = await derivePairingKey(secrets, salt);
  const plaintext = encoder.encode(JSON.stringify({
    format: FORMAT,
    version: VERSION,
    context,
    issuedAt,
    expiresAt,
    pairingId,
    data,
  }));
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    plaintext.fill(0);
    throw new Error('De koppelgegevens zijn te groot voor een QR-overdracht.');
  }

  let ciphertext;
  try {
    ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(context, issuedAt, expiresAt), tagLength: 128 },
      key,
      plaintext,
    );
  } finally {
    plaintext.fill(0);
  }

  const envelope = {
    format: FORMAT,
    version: VERSION,
    context,
    issuedAt,
    expiresAt,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
  const payload = PREFIX + bytesToBase64Url(encoder.encode(JSON.stringify(envelope)));
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error('De koppelcode is te groot voor een betrouwbare QR-scan.');
  }
  return { payload, pairingId, issuedAt, expiresAt };
}

/** Ontsleutelt en valideert een overdracht; past zelf niets toe en schrijft geen app-data. */
export async function openPairingPayload({ payload, secrets, context, now = Date.now() } = {}) {
  validateContext(context);
  if (typeof payload !== 'string' || !payload.startsWith(PREFIX) || payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error('Dit is geen geldige PWA-Core-koppelcode.');
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Ongeldig tijdstip.');

  let envelope;
  try {
    envelope = JSON.parse(decoder.decode(base64UrlToBytes(payload.slice(PREFIX.length), 'inhoud')));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('De koppelcode bevat')) throw error;
    throw new Error('De QR-code is beschadigd of onvolledig.');
  }

  if (envelope?.format !== FORMAT || envelope.version !== VERSION ||
      envelope.context !== context ||
      !Number.isSafeInteger(envelope.issuedAt) || !Number.isSafeInteger(envelope.expiresAt)) {
    throw new Error('Deze koppelcode is ongeldig of hoort bij een andere app.');
  }
  if (envelope.expiresAt <= now || now - envelope.issuedAt > TTL_MS) {
    throw new Error('Deze QR-code is verlopen. Maak op het andere apparaat een nieuwe code.');
  }
  if (envelope.issuedAt > now + 30000 || envelope.expiresAt - envelope.issuedAt !== TTL_MS) {
    throw new Error('De geldigheidsduur van deze QR-code klopt niet.');
  }

  const salt = base64UrlToBytes(envelope.salt, 'salt');
  const iv = base64UrlToBytes(envelope.iv, 'initialisatievector');
  const ciphertext = base64UrlToBytes(envelope.ciphertext, 'versleutelde inhoud');
  if (salt.length !== 16 || iv.length !== 12 ||
      ciphertext.length < 17 || ciphertext.length > MAX_PLAINTEXT_BYTES + 16) {
    throw new Error('De koppelcode heeft een ongeldige inhoud.');
  }

  const key = await derivePairingKey(secrets, salt);
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
    throw new Error('De opgegeven koppelgeheimen horen niet bij deze code, of de code is beschadigd.');
  } finally {
    plaintext?.fill(0);
  }

  if (decoded?.format !== FORMAT || decoded.version !== VERSION ||
      decoded.context !== context || decoded.issuedAt !== envelope.issuedAt ||
      decoded.expiresAt !== envelope.expiresAt || !validatePairingId(decoded.pairingId)) {
    throw new Error('De ontsleutelde koppelgegevens zijn ongeldig.');
  }
  validatePayloadData(decoded.data);
  return {
    data: decoded.data,
    pairingId: decoded.pairingId,
    issuedAt: decoded.issuedAt,
    expiresAt: decoded.expiresAt,
  };
}

/**
 * Markeert een pairing-ID als gebruikt op dit apparaat.
 * Dit is lokale replaybescherming, geen globale eenmaligheid: zonder server/rendezvous
 * kan een andere installatie dezelfde nog geldige QR-code niet centraal blokkeren.
 * Roep dit pas aan nadat de app de koppeling succesvol heeft afgerond.
 */
export function markPairingUsed(storage, pairingId, {
  storageKey = 'pwa-core:device-pairing:used',
  now = Date.now(),
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
    throw new Error('Deze QR-code is op dit apparaat al gebruikt. Maak een nieuwe code.');
  }
  entries.push({ pairingId, usedAt: now });
  storage.setItem(storageKey, JSON.stringify(entries.slice(-32)));
}

export const DEVICE_PAIRING_TTL_MS = TTL_MS;
export const DEVICE_PAIRING_KDF_ITERATIONS = KDF_ITERATIONS;
