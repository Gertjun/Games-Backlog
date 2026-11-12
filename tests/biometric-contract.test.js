import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

// Dit zijn modulecontracttests met nagebootste WebAuthn-antwoorden, geen
// bewijs van ondersteuning door een echte browser of platform-authenticator.
const root = await mkdtemp(path.join(tmpdir(), 'pwa-core-biometric-'));
await mkdir(path.join(root, 'js', 'core'), { recursive: true });
for (const file of ['biometric.js', 'crypto.js']) {
  await cp(new URL(`../js/core/${file}`, import.meta.url), path.join(root, 'js', 'core', file));
}
await writeFile(path.join(root, 'js', 'config.js'), `
export const APP = { name: 'Biometric test app', storagePrefix: 'biometric-contract-test' };
`);

class MemoryStorage {
  getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; }
  setItem(key, value) { this[key] = String(value); }
  removeItem(key) { delete this[key]; }
  clear() { for (const key of Object.keys(this)) delete this[key]; }
}
globalThis.localStorage = new MemoryStorage();
globalThis.crypto ??= webcrypto;

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalPublicKeyCredential = Object.getOwnPropertyDescriptor(globalThis, 'PublicKeyCredential');
const biometric = await import(pathToFileURL(path.join(root, 'js', 'core', 'biometric.js')).href);
const crypto = await import(pathToFileURL(path.join(root, 'js', 'core', 'crypto.js')).href);
const STORE_KEY = 'biometric-contract-test:biometric';

function setPlatform(credentials, supported = true, capabilities = undefined) {
  const platformCredential = {
    isUserVerifyingPlatformAuthenticatorAvailable: async () => supported,
  };
  if (capabilities !== undefined) {
    platformCredential.getClientCapabilities = async () => capabilities;
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { credentials } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { PublicKeyCredential: platformCredential } });
  Object.defineProperty(globalThis, 'PublicKeyCredential', { configurable: true, value: platformCredential });
}

function assertion(secret, { userHandle = null, rawId = new Uint8Array([1, 2, 3]) } = {}) {
  return {
    rawId,
    response: { userHandle },
    getClientExtensionResults: () => ({ prf: secret ? { results: { first: secret } } : {} }),
  };
}

async function clean() {
  localStorage.clear();
  setPlatform({ create: async () => { throw new Error('unexpected create'); }, get: async () => { throw new Error('unexpected get'); } });
}

test('isSupported handelt ontbrekende API, ondersteuning en exceptions af', async () => {
  await clean();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  assert.equal(await biometric.isSupported(), false);

  setPlatform({}, true);
  assert.equal(await biometric.isSupported(), true);
  setPlatform({}, false);
  assert.equal(await biometric.isSupported(), false);
  setPlatform({ get: async () => {} });
  globalThis.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => { throw new Error('unsupported'); };
  assert.equal(await biometric.isSupported(), false);
});

test('isSupported weigert een browser die PRF expliciet niet ondersteunt', async () => {
  await clean();
  setPlatform({}, true, { 'extension:prf': false });
  assert.equal(await biometric.isSupported(), false);
});

test('isSupported accepteert browser-PRF-capability maar authenticator blijft leidend', async () => {
  await clean();
  setPlatform({}, true, { 'extension:prf': true });
  assert.equal(await biometric.isSupported(), true);
});

test('isSupported valt terug op platformdetectie als getClientCapabilities faalt', async () => {
  await clean();
  setPlatform({});
  globalThis.PublicKeyCredential.getClientCapabilities = async () => { throw new Error('not implemented'); };
  assert.equal(await biometric.isSupported(), true);
});

test('enroll bewaart PRF-credentialmetadata en unlock levert dezelfde datasleutel terug', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  const secret = crypto.randomBytes(32);
  const credentialId = new Uint8Array([10, 20, 30, 40]);
  setPlatform({
    create: async (options) => {
      assert.equal(options.publicKey.authenticatorSelection.residentKey, 'required');
      assert.equal(options.publicKey.authenticatorSelection.userVerification, 'required');
      assert.ok(options.publicKey.extensions.prf.eval.first instanceof Uint8Array);
      return {
        rawId: credentialId,
        getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: secret } } }),
      };
    },
    get: async (options) => {
      assert.deepEqual([...options.publicKey.allowCredentials[0].id], [...credentialId]);
      assert.equal(options.publicKey.userVerification, 'required');
      return assertion(secret, { rawId: credentialId });
    },
  });

  await biometric.enroll(dataKey);
  assert.equal(biometric.isEnrolled(), true);
  const stored = JSON.parse(localStorage.getItem(STORE_KEY));
  assert.equal(stored.credentialId, crypto.bytesToB64(credentialId));
  assert.ok(stored.prfSalt && stored.hkdfSalt && stored.wrapped);
  assert.equal(JSON.stringify(stored).includes(Buffer.from(secret).toString('base64')), false);

  const unlocked = await biometric.unlock();
  assert.equal(await crypto.sameKey(dataKey, unlocked), true);
});

test('enroll haalt PRF-resultaat op met credentials.get wanneer create alleen enabled meldt', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  const secret = crypto.randomBytes(32);
  const credentialId = new Uint8Array([7, 8, 9]);
  setPlatform({
    create: async () => ({
      rawId: credentialId,
      getClientExtensionResults: () => ({ prf: { enabled: true } }),
    }),
    get: async (options) => {
      assert.ok(options.publicKey.extensions.prf.eval.first);
      return assertion(secret, { rawId: credentialId });
    },
  });

  await biometric.enroll(dataKey);
  assert.equal(biometric.isEnrolled(), true);
  assert.equal(await crypto.sameKey(dataKey, await biometric.unlock()), true);
});

test('enroll weigert expliciet een authenticator zonder PRF', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  setPlatform({
    create: async () => ({
      rawId: new Uint8Array([1]),
      getClientExtensionResults: () => ({ prf: { enabled: false } }),
    }),
  });

  await assert.rejects(biometric.enroll(dataKey), /PRF.*wachtwoord/i);
  assert.equal(biometric.isEnrolled(), false);
});

test('enroll weigert ontbrekende PRF-output en bewaart geen passkeyregistratie', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  setPlatform({
    create: async () => ({
      rawId: new Uint8Array([4, 5, 6]),
      getClientExtensionResults: () => ({}),
    }),
    get: async () => assertion(null),
  });
  await assert.rejects(biometric.enroll(dataKey), /geen PRF-resultaat/i);
  assert.equal(biometric.isEnrolled(), false);
});

test('enroll weigert een PRF-resultaat met een onjuiste lengte', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  setPlatform({
    create: async () => ({
      rawId: new Uint8Array([31, 32]),
      getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: new Uint8Array(16) } } }),
    }),
  });
  await assert.rejects(biometric.enroll(dataKey), /32 bytes/i);
  assert.equal(biometric.isEnrolled(), false);
});

test('unlock weigert een PRF-resultaat dat niet exact 32 bytes is', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  const validSecret = crypto.randomBytes(32);
  const credentialId = new Uint8Array([41, 42]);
  setPlatform({
    create: async () => ({
      rawId: credentialId,
      getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: validSecret } } }),
    }),
    get: async () => assertion(validSecret, { rawId: credentialId }),
  });
  await biometric.enroll(dataKey);

  setPlatform({ get: async () => assertion(new Uint8Array(16), { rawId: credentialId }) });
  await assert.rejects(biometric.unlock(), /32 bytes/i);
});

test('enrollExisting weigert een passkey die bij een andere app hoort', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  const secret = crypto.randomBytes(32);
  const foreignHandle = new TextEncoder().encode('another-app:user-id');
  setPlatform({
    get: async () => assertion(secret, { userHandle: foreignHandle.buffer }),
  });

  await assert.rejects(biometric.enrollExisting(dataKey), /andere app/i);
  assert.equal(biometric.isEnrolled(), false);
});

test('enrollExisting weigert een passkey zonder PRF en houdt wachtwoordfallback beschikbaar', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  setPlatform({ get: async () => assertion(null) });
  await assert.rejects(biometric.enrollExisting(dataKey), /wachtwoord openen/i);
  assert.equal(biometric.isEnrolled(), false);
});

test('enrollExisting accepteert een legacy-passkey zonder herkenbare userHandle', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  const secret = crypto.randomBytes(32);
  const credentialId = new Uint8Array([3, 4, 5]);
  setPlatform({
    get: async () => assertion(secret, { rawId: credentialId, userHandle: null }),
  });

  await biometric.enrollExisting(dataKey);
  assert.equal(biometric.isEnrolled(), true);
  assert.equal(await crypto.sameKey(dataKey, await biometric.unlock()), true);
});

test('ontbrekend PRF-resultaat bij unlock wordt als bruikbare fout gemeld', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  const secret = crypto.randomBytes(32);
  const credentialId = new Uint8Array([11, 12]);
  setPlatform({
    create: async () => ({
      rawId: credentialId,
      getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: secret } } }),
    }),
    get: async () => assertion(null, { rawId: credentialId }),
  });
  await biometric.enroll(dataKey);

  await assert.rejects(biometric.unlock(), /geen PRF-resultaat/i);
});

test('verkeerd PRF-geheim leidt naar wachtwoord-terugvalmelding', async () => {
  await clean();
  const dataKey = await crypto.generateDataKey();
  const secret = crypto.randomBytes(32);
  const credentialId = new Uint8Array([21, 22]);
  setPlatform({
    create: async () => ({
      rawId: credentialId,
      getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: secret } } }),
    }),
    get: async () => assertion(crypto.randomBytes(32), { rawId: credentialId }),
  });
  await biometric.enroll(dataKey);

  await assert.rejects(biometric.unlock(), /Gebruik je wachtwoord/i);
});

test('unlock zonder ingestelde passkey faalt gecontroleerd en disable wist de registratie', async () => {
  await clean();
  await assert.rejects(biometric.unlock(), /niet ingesteld/i);
  localStorage.setItem(STORE_KEY, JSON.stringify({ placeholder: true }));
  assert.equal(biometric.isEnrolled(), true);
  biometric.disable();
  assert.equal(biometric.isEnrolled(), false);
});

test.after(async () => {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete globalThis.window;
  if (originalPublicKeyCredential) Object.defineProperty(globalThis, 'PublicKeyCredential', originalPublicKeyCredential);
  else delete globalThis.PublicKeyCredential;
  await rm(root, { recursive: true, force: true });
});
