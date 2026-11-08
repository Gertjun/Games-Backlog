// Kern-cryptografie — alleen de Web Crypto API, geen externe libraries.
//
// Sleutelmodel:
//   - Een willekeurige 256-bit datasleutel (DEK) versleutelt de gegevens (AES-GCM).
//   - De DEK wordt "ingepakt" met een sleutel afgeleid van je wachtwoord (PBKDF2)
//     en optioneel met een sleutel uit je passkey/Face ID (WebAuthn PRF + HKDF).
//   - Wachtwoord wijzigen = alleen de DEK opnieuw inpakken; data blijft gelijk.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function b64ToBytes(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function generateDataKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Sleutel-inpaksleutel afgeleid van een wachtwoord. */
export async function passwordKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Sleutel-inpaksleutel afgeleid van een geheim (bijv. passkey-PRF-uitvoer). */
export async function secretKey(secret, salt, info) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export async function wrapDataKey(dataKey, wrappingKey) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, { name: 'AES-GCM', iv });
  return { iv: bytesToB64(iv), data: bytesToB64(data) };
}

/** Gooit een fout als de inpaksleutel niet klopt (bijv. verkeerd wachtwoord). */
export function unwrapDataKey(wrapped, wrappingKey) {
  return crypto.subtle.unwrapKey(
    'raw',
    b64ToBytes(wrapped.data),
    wrappingKey,
    { name: 'AES-GCM', iv: b64ToBytes(wrapped.iv) },
    { name: 'AES-GCM', length: 256 },
    true, // exporteerbaar: nodig om opnieuw in te pakken (wachtwoord/passkey wijzigen)
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(value, key) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv: bytesToB64(iv), data: bytesToB64(data) };
}

export async function decryptJSON(box, key) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(box.iv) }, key, b64ToBytes(box.data));
  return JSON.parse(dec.decode(plain));
}

export async function sameKey(a, b) {
  const [ra, rb] = await Promise.all([crypto.subtle.exportKey('raw', a), crypto.subtle.exportKey('raw', b)]);
  const x = new Uint8Array(ra);
  const y = new Uint8Array(rb);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
