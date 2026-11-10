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

// Vaste PRF-invoer per app. Zo levert dezelfde passkey altijd hetzelfde geheim
// op, ook na opnieuw installeren (als de lokale opslag gewist is). De invoer is
// niet geheim; het geheim zit in de passkey en komt pas vrij na biometrie.
const PRF_LABEL = `${APP.storagePrefix}:biometric-prf:v1`;
// Begin van user.id bij nieuwe passkeys, om passkeys van andere apps op
// hetzelfde domein te herkennen.
const USER_TAG = new TextEncoder().encode(`${APP.storagePrefix}:`);

async function appPrfSalt() {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PRF_LABEL)));
}

function belongsToOtherApp(userHandle) {
  if (!userHandle || userHandle.byteLength === 0) return false;
  const id = new Uint8Array(userHandle);
  const colon = id.indexOf(0x3a);
  // Oude passkeys (vóór dit kenmerk) hebben een willekeurige id: accepteren.
  if (colon < 1 || colon > 40) return false;
  if (id.length < USER_TAG.length) return true;
  return !USER_TAG.every((b, i) => id[i] === b);
}

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

/** Pakt de datasleutel in met het PRF-geheim en bewaart dat op dit apparaat. */
async function store(dataKey, credentialId, prfSalt, secret) {
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

/** Maakt een nieuwe passkey aan en gebruikt die voor ontgrendelen. */
export async function enroll(dataKey) {
  const prfSalt = await appPrfSalt();
  const userId = new Uint8Array(USER_TAG.length + 16);
  userId.set(USER_TAG);
  userId.set(c.randomBytes(16), USER_TAG.length);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: c.randomBytes(32),
      rp: { name: APP.name },
      user: { id: userId, name: `${APP.name} – ontgrendelen`, displayName: APP.name },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
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

  await store(dataKey, credentialId, prfSalt, secret);
}

/**
 * Gebruikt een passkey die al bestaat (bijvoorbeeld na opnieuw installeren).
 * De browser toont de passkeys voor dit domein; je kiest er één.
 */
export async function enrollExisting(dataKey) {
  const prfSalt = await appPrfSalt();
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: c.randomBytes(32),
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  if (belongsToOtherApp(assertion.response.userHandle)) {
    throw new Error(`Deze passkey hoort bij een andere app. Kies "${APP.name} – ontgrendelen".`);
  }
  const out = assertion.getClientExtensionResults().prf?.results?.first;
  if (!out) throw new Error('Deze passkey ondersteunt ontgrendelen niet (PRF). Kies een andere of maak een nieuwe.');
  await store(dataKey, new Uint8Array(assertion.rawId), prfSalt, new Uint8Array(out));
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
