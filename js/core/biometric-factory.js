// Factory voor per-vault WebAuthn PRF-enrollment en sleutelafleiding.
import * as c from './crypto.js';

const USER_HANDLE_MARKER = 'pwc1:';
const USER_HANDLE_RANDOM_BYTES = 16;
const USER_HANDLE_MAX_BYTES = 64;

function validateUserHandleIdentity(storagePrefix, scope) {
  if (typeof storagePrefix !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(storagePrefix)) {
    throw new TypeError('storagePrefix moet één stabiel namespace-segment zijn.');
  }
  if (typeof scope !== 'string' || !/^[a-z0-9-]{1,12}$/i.test(scope)) {
    throw new TypeError('scope moet een korte, stabiele identificatie zijn.');
  }
}

async function compactUserHandleTag(storagePrefix, scope) {
  const identity = new TextEncoder().encode(`${scope.toLowerCase()}\0${storagePrefix}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', identity));
  const shortHash = [...digest.slice(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${USER_HANDLE_MARKER}${scope.toLowerCase()}:${shortHash}:`;
}

/**
 * Bouwt een stabiele, app- en functienamespaced WebAuthn user.id.
 * De volledige storagePrefix wordt gehasht; de resulterende ID blijft ruim
 * onder de WebAuthn-limiet van 64 bytes, ook bij lange workspace-namen.
 */
export async function createUserHandle({ storagePrefix, scope = 'vault' } = {}) {
  validateUserHandleIdentity(storagePrefix, scope);
  const tag = new TextEncoder().encode(await compactUserHandleTag(storagePrefix, scope));
  const userId = new Uint8Array(tag.length + USER_HANDLE_RANDOM_BYTES);
  userId.set(tag);
  userId.set(c.randomBytes(USER_HANDLE_RANDOM_BYTES), tag.length);
  if (userId.byteLength > USER_HANDLE_MAX_BYTES) {
    throw new RangeError('De gegenereerde WebAuthn user.id overschrijdt 64 bytes.');
  }
  return userId;
}

/**
 * Controleert of een gestructureerde userHandle bij een andere app/functie
 * hoort. Onherkenbare legacy-handles (waaronder null) blijven koppelbaar.
 * legacyPrefixes en legacyTags zijn uitsluitend voor expliciet ondersteunde
 * oude formaten van dezelfde app/functie.
 */
export async function isForeignUserHandle(
  userHandle,
  { storagePrefix, scope = 'vault', legacyPrefixes = [storagePrefix], legacyTags = [] } = {},
) {
  validateUserHandleIdentity(storagePrefix, scope);
  if (!userHandle || userHandle.byteLength === 0) return false;

  const id = userHandle instanceof ArrayBuffer
    ? new Uint8Array(userHandle)
    : ArrayBuffer.isView(userHandle)
      ? new Uint8Array(userHandle.buffer, userHandle.byteOffset, userHandle.byteLength)
      : null;
  if (!id || id.byteLength === 0) return false;

  const text = new TextDecoder().decode(id);
  if (text.startsWith(USER_HANDLE_MARKER)) {
    const match = /^pwc1:([a-z0-9-]{1,12}):([a-f0-9]{24}):/i.exec(text);
    if (!match) return true;
    const expected = await compactUserHandleTag(storagePrefix, scope);
    return !text.startsWith(expected);
  }

  const acceptedTags = [
    ...legacyPrefixes
      .filter((prefix) => typeof prefix === 'string' && prefix.length > 0)
      .map((prefix) => `${prefix}:`),
    ...legacyTags.filter((tag) => typeof tag === 'string' && tag.length > 0),
  ];
  if (acceptedTags.some((tag) => text.startsWith(tag))) return false;

  const colon = id.indexOf(0x3a);
  // Oude willekeurige userHandles hebben geen herkenbare namespace.
  if (colon < 1 || colon > 40) return false;
  return true;
}

export function createBiometric({ storagePrefix, appName, storage = globalThis.localStorage } = {}) {
  if (typeof storagePrefix !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(storagePrefix)) throw new TypeError('storagePrefix moet één stabiel namespace-segment zijn (letters, cijfers, punt, underscore of koppelteken; geen dubbele punt).');
  if (typeof appName !== 'string' || !appName.trim()) throw new TypeError('appName moet een niet-lege string zijn.');
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') throw new TypeError('storage voldoet niet aan het Storage-contract.');
// Ontgrendelen met Face ID / Touch ID / Windows Hello / passkey via WebAuthn PRF.
//
// De passkey levert (na biometrie) een geheim op via de PRF-extensie. Daaruit
// leiden we een sleutel af die de datasleutel inpakt. Zonder je gezicht/vinger
// is dat geheim niet te krijgen. Werkt in Safari (iOS/macOS 18+), Chrome, Edge.
// Wordt PRF niet ondersteund, dan blijft gewoon het wachtwoord werken.


const STORE_KEY = `${storagePrefix}:biometric`;
const HKDF_INFO = `${storagePrefix}:biometric-kek:v1`;

// Vaste PRF-invoer per app. Zo levert dezelfde passkey altijd hetzelfde geheim
// op, ook na opnieuw installeren (als de lokale opslag gewist is). De invoer is
// niet geheim; het geheim zit in de passkey en komt pas vrij na biometrie.
const PRF_LABEL = `${storagePrefix}:biometric-prf:v1`;

async function appPrfSalt() {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PRF_LABEL)));
}

async function isSupported() {
  const credentialApi = window.PublicKeyCredential;
  if (!credentialApi || !navigator.credentials) return false;
  try {
    if (!(await credentialApi.isUserVerifyingPlatformAuthenticatorAvailable())) return false;
    // Browser capability is advisory: the selected authenticator must still
    // prove PRF support through the actual create()/get() extension result.
    if (typeof credentialApi.getClientCapabilities === 'function') {
      try {
        const capabilities = await credentialApi.getClientCapabilities();
        if (capabilities?.['extension:prf'] === false) return false;
      } catch {
        // Older/partial implementations may expose the method but fail it.
        // Keep the password path available and allow a user-initiated attempt.
      }
    }
    return true;
  } catch {
    return false;
  }
}

const isEnrolled = () => storage.getItem(STORE_KEY) !== null;
const disable = () => storage.removeItem(STORE_KEY);

function readPrfSecret(out) {
  if (!out) throw new Error('Deze browser of passkey levert geen PRF-resultaat. Ontgrendel met je wachtwoord of kies een andere passkey.');
  const bytes = out instanceof ArrayBuffer
    ? new Uint8Array(out)
    : ArrayBuffer.isView(out)
      ? new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
      : null;
  if (!bytes || bytes.byteLength !== 32) {
    throw new Error('De authenticator leverde geen geldig PRF-resultaat van 32 bytes. Ontgrendel met je wachtwoord of kies een andere passkey.');
  }
  return bytes;
}

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
  return readPrfSecret(out);
}

/** Pakt de datasleutel in met het PRF-geheim en bewaart dat op dit apparaat. */
async function store(dataKey, credentialId, prfSalt, secret) {
  const hkdfSalt = c.randomBytes(32);
  const kek = await c.secretKey(secret, hkdfSalt, HKDF_INFO);
  const wrapped = await c.wrapDataKey(dataKey, kek);

  storage.setItem(STORE_KEY, JSON.stringify({
    credentialId: c.bytesToB64(credentialId),
    prfSalt: c.bytesToB64(prfSalt),
    hkdfSalt: c.bytesToB64(hkdfSalt),
    wrapped,
  }));
}

/** Maakt een nieuwe passkey aan en gebruikt die voor ontgrendelen. */
async function enroll(dataKey) {
  const prfSalt = await appPrfSalt();
  const userId = await createUserHandle({ storagePrefix, scope: 'vault' });
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: c.randomBytes(32),
      rp: { name: appName },
      user: { id: userId, name: `${appName} – ontgrendelen`, displayName: appName },
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
    throw new Error('Deze passkey ondersteunt PRF niet. Gebruik je wachtwoord of kies een andere passkey.');
  }
  const credentialId = new Uint8Array(cred.rawId);
  // Sommige platforms geven het PRF-resultaat pas bij een get()-aanroep.
  const secret = ext.prf?.results?.first
    ? readPrfSecret(ext.prf.results.first)
    : await evaluatePrf(credentialId, prfSalt);

  await store(dataKey, credentialId, prfSalt, secret);
}

/**
 * Gebruikt een passkey die al bestaat (bijvoorbeeld na opnieuw installeren).
 * De browser toont de passkeys voor dit domein; je kiest er één.
 */
async function enrollExisting(dataKey) {
  const prfSalt = await appPrfSalt();
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: c.randomBytes(32),
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  if (await isForeignUserHandle(assertion.response.userHandle, { storagePrefix, scope: 'vault' })) {
    throw new Error(`Deze passkey hoort bij een andere app. Kies "${appName} – ontgrendelen".`);
  }
  const out = assertion.getClientExtensionResults().prf?.results?.first;
  if (!out) throw new Error('Deze passkey ondersteunt PRF niet. Kies een andere passkey; je kunt de kluis ook met je wachtwoord openen.');
  await store(dataKey, new Uint8Array(assertion.rawId), prfSalt, readPrfSecret(out));
}

/** Geeft de datasleutel terug na succesvolle biometrie. */
async function unlock() {
  const rec = JSON.parse(storage.getItem(STORE_KEY) || 'null');
  if (!rec) throw new Error('Ontgrendelen met passkey is niet ingesteld.');
  const secret = await evaluatePrf(c.b64ToBytes(rec.credentialId), c.b64ToBytes(rec.prfSalt));
  const kek = await c.secretKey(secret, c.b64ToBytes(rec.hkdfSalt), HKDF_INFO);
  try {
    return await c.unwrapDataKey(rec.wrapped, kek);
  } catch {
    throw new Error('Ontgrendelen met passkey werkt niet meer. Gebruik je wachtwoord en stel het opnieuw in.');
  }
}

  return { isSupported, isEnrolled, disable, enroll, enrollExisting, unlock };
}
