// Koppelcode: een volgend apparaat koppelen zonder repo en token over te typen.
//
// De code bevat de GitHub-koppeling (eigenaar, repo, branch, pad en token),
// versleuteld met een willekeurige pincode die apart wordt getoond. Zonder die
// pincode is de code onbruikbaar. Het wachtwoord van de kluis zit er NIET in:
// dat vul je op het nieuwe apparaat zelf in.

import { APP } from '../config.js';
import { bytesToB64, b64ToBytes, randomBytes } from './crypto.js';

const PREFIX = 'PWK1.';
const PIN_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // zonder 0/O en 1/I/L: makkelijk over te typen
const ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** Nieuwe pincode, bijvoorbeeld "AB3D-7KMP". */
export function newPin() {
  const s = [...randomBytes(8)].map((x) => PIN_CHARS[x % PIN_CHARS.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const normalizePin = (pin) => String(pin || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

async function pinKey(pin, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizePin(pin)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

const toUrl = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function fromUrl(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return b64;
}

/** @param {{owner, repo, branch, path, token}} github */
export async function makePairCode(github, pin) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const payload = { app: APP.storagePrefix, github, made: Date.now() };
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await pinKey(pin, salt), enc.encode(JSON.stringify(payload)),
  );
  const box = { s: bytesToB64(salt), i: bytesToB64(iv), d: bytesToB64(data) };
  return PREFIX + toUrl(bytesToB64(enc.encode(JSON.stringify(box))));
}

/** @returns {Promise<{owner, repo, branch, path, token}>} */
export async function readPairCode(code, pin) {
  const text = String(code || '').trim().replace(/\s+/g, '');
  if (!text.startsWith(PREFIX)) throw new Error('Dit is geen koppelcode van deze app.');
  if (normalizePin(pin).length !== 8) throw new Error('De pincode heeft 8 tekens, bijvoorbeeld AB3D-7KMP.');
  let box;
  try {
    box = JSON.parse(dec.decode(b64ToBytes(fromUrl(text.slice(PREFIX.length)))));
  } catch {
    throw new Error('De koppelcode is niet compleet. Kopieer hem opnieuw.');
  }
  let payload;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(box.i) }, await pinKey(pin, b64ToBytes(box.s)), b64ToBytes(box.d),
    );
    payload = JSON.parse(dec.decode(plain));
  } catch {
    throw new Error('De pincode klopt niet bij deze koppelcode.');
  }
  if (payload.app !== APP.storagePrefix) throw new Error(`Deze koppelcode hoort bij een andere app, niet bij ${APP.name}.`);
  return payload.github;
}
