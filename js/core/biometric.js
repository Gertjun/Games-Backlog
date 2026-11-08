// Ontgrendelen met Face ID / Touch ID / Windows Hello / passkey via WebAuthn PRF.
//
// De passkey levert (na biometrie) een geheim op via de PRF-extensie. Daaruit
// leiden we een sleutel af die de datasleutel inpakt. Zonder je gezicht/vinger
// is dat geheim niet te krijgen. Werkt in Safari (iOS/macOS 18+), Chrome, Edge.
// Wordt PRF niet ondersteund, dan blijft gewoon het wachtwoord werken.

import { APP } from '../config.js';
import * as c from './crypto.js';

const STORE_KEY = `${APP.storagePrefix}:biometric`;
const HKDF_INFO = `${APP.storagePrefix}:biometric-kek:v1`;

export async function isSupported() {
  if (!window.PublicKeyCredential || !navigator.credentials) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export const isEnrolled = () => localStorage.getItem(STORE_KEY) !== null;
export const disable = () => localStorage.removeItem(STORE_KEY);

async function evaluatePrf(credentialId, prfSalt) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: c.randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const out = assertion.getClientExtensionResults().prf?.results?.first;
  if (!out) throw new Error('Deze browser of passkey ondersteunt ontgrendelen niet (PRF ontbreekt).');
  return new Uint8Array(out);
}

export async function enroll(dataKey) {
  const prfSalt = c.randomBytes(32);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: c.randomBytes(32),
      rp: { name: APP.name },
      user: { id: c.randomBytes(16), name: `${APP.name} – ontgrendelen`, displayName: APP.name },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });

  const ext = cred.getClientExtensionResults();
  if (ext.prf?.enabled === false) {
    throw new Error('Deze passkey ondersteunt ontgrendelen niet (PRF). Gebruik je wachtwoord.');
  }
  const credentialId = new Uint8Array(cred.rawId);
  // Sommige platforms geven het PRF-resultaat pas bij een get()-aanroep.
  const secret = ext.prf?.results?.first
    ? new Uint8Array(ext.prf.results.first)
    : await evaluatePrf(credentialId, prfSalt);

  const hkdfSalt = c.randomBytes(32);
  const kek = await c.secretKey(secret, hkdfSalt, HKDF_INFO);
  const wrapped = await c.wrapDataKey(dataKey, kek);

  localStorage.setItem(STORE_KEY, JSON.stringify({
    credentialId: c.bytesToB64(credentialId),
    prfSalt: c.bytesToB64(prfSalt),
    hkdfSalt: c.bytesToB64(hkdfSalt),
    wrapped,
  }));
}

/** Geeft de datasleutel terug na succesvolle biometrie. */
export async function unlock() {
  const rec = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (!rec) throw new Error('Ontgrendelen met passkey is niet ingesteld.');
  const secret = await evaluatePrf(c.b64ToBytes(rec.credentialId), c.b64ToBytes(rec.prfSalt));
  const kek = await c.secretKey(secret, c.b64ToBytes(rec.hkdfSalt), HKDF_INFO);
  try {
    return await c.unwrapDataKey(rec.wrapped, kek);
  } catch {
    throw new Error('Ontgrendelen met passkey werkt niet meer. Gebruik je wachtwoord en stel het opnieuw in.');
  }
}
