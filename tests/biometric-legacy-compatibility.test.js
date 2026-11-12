import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

// Synthetische legacy-opslag in dezelfde vorm als de vorige Games Backlog-kern.
// Geen echte lokale kluis of passkey wordt benaderd.
const root = await mkdtemp(path.join(tmpdir(), 'games-backlog-legacy-passkey-'));
await mkdir(path.join(root, 'js', 'core'), { recursive: true });
for (const file of ['biometric.js', 'crypto.js']) {
  await cp(new URL(`../js/core/${file}`, import.meta.url), path.join(root, 'js', 'core', file));
}
await writeFile(path.join(root, 'js', 'config.js'), `
export const APP = { name: 'Games Backlog', storagePrefix: 'games-backlog' };
`);

class MemoryStorage {
  getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; }
  setItem(key, value) { this[key] = String(value); }
  removeItem(key) { delete this[key]; }
  clear() { for (const key of Object.keys(this)) delete this[key]; }
}
globalThis.localStorage = new MemoryStorage();
globalThis.crypto ??= webcrypto;

const biometric = await import(pathToFileURL(path.join(root, 'js', 'core', 'biometric.js')).href);
const crypto = await import(pathToFileURL(path.join(root, 'js', 'core', 'crypto.js')).href);
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

test('officiële Core ontgrendelt een legacy Games Backlog-passkeyrecord', async () => {
  localStorage.clear();
  const dataKey = await crypto.generateDataKey();
  const secret = crypto.randomBytes(32);
  const credentialId = new Uint8Array([17, 29, 41, 53]);
  const prfSalt = crypto.randomBytes(32);
  const hkdfSalt = crypto.randomBytes(32);
  const info = 'games-backlog:biometric-kek:v1';
  const kek = await crypto.secretKey(secret, hkdfSalt, info);
  const wrapped = await crypto.wrapDataKey(dataKey, kek);

  // Dit is exact het bestaande recordformaat: dezelfde opslagkey en velden.
  localStorage.setItem('games-backlog:biometric', JSON.stringify({
    credentialId: crypto.bytesToB64(credentialId),
    prfSalt: crypto.bytesToB64(prfSalt),
    hkdfSalt: crypto.bytesToB64(hkdfSalt),
    wrapped,
  }));

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      credentials: {
        get: async options => {
          assert.deepEqual([...options.publicKey.allowCredentials[0].id], [...credentialId]);
          assert.deepEqual([...options.publicKey.extensions.prf.eval.first], [...prfSalt]);
          return {
            getClientExtensionResults: () => ({ prf: { results: { first: secret } } }),
          };
        },
      },
    },
  });

  const unlocked = await biometric.unlock();
  assert.equal(await crypto.sameKey(dataKey, unlocked), true);
  assert.equal(biometric.isEnrolled(), true);
});

test.after(async () => {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  await rm(root, { recursive: true, force: true });
});
