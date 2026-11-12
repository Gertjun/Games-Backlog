import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bytesToB64, b64ToBytes, randomBytes, generateDataKey, passwordKey,
  secretKey, wrapDataKey, unwrapDataKey, encryptJSON, decryptJSON, sameKey,
} from '../js/core/crypto.js';

test('base64 round-trip behoudt bytes inclusief nul en hoge waarden', () => {
  const input = new Uint8Array([0, 1, 127, 128, 255]);
  assert.deepEqual(b64ToBytes(bytesToB64(input)), input);
});

test('randomBytes levert gevraagde lengte en willekeurige waarden', () => {
  const a = randomBytes(32), b = randomBytes(32);
  assert.equal(a.length, 32);
  assert.equal(b.length, 32);
  assert.notDeepEqual(a, b);
});

test('AES-GCM JSON-encryptie rondt objecten veilig af', async () => {
  const key = await generateDataKey();
  const value = { label: 'PWA-Core', nested: [1, true, null] };
  const encrypted = await encryptJSON(value, key);
  assert.notEqual(encrypted.data, JSON.stringify(value));
  assert.deepEqual(await decryptJSON(encrypted, key), value);
});

test('AES-GCM weigert een gewijzigde ciphertext', async () => {
  const key = await generateDataKey();
  const encrypted = await encryptJSON({ secret: 'test' }, key);
  const bytes = b64ToBytes(encrypted.data);
  bytes[0] ^= 1;
  await assert.rejects(decryptJSON({ ...encrypted, data: bytesToB64(bytes) }));
});

test('passwordKey normaliseert wachtwoorden naar NFC', async () => {
  const salt = randomBytes(16);
  const a = await passwordKey('cafe\u0301', salt, 1000);
  const b = await passwordKey('café', salt, 1000);
  const keyA = await generateDataKey();
  const wrapped = await wrapDataKey(keyA, a);
  const restored = await unwrapDataKey(wrapped, b);
  assert.equal(await sameKey(keyA, restored), true);
});

test('verkeerde wachtwoordsleutel kan datasleutel niet uitpakken', async () => {
  const salt = randomBytes(16);
  const correct = await passwordKey('correct', salt, 1000);
  const wrong = await passwordKey('wrong', salt, 1000);
  const key = await generateDataKey();
  const wrapped = await wrapDataKey(key, correct);
  await assert.rejects(unwrapDataKey(wrapped, wrong));
});

test('HKDF-gebaseerde geheime sleutel kan datasleutel uitpakken', async () => {
  const secret = randomBytes(32), salt = randomBytes(16);
  const a = await secretKey(secret, salt, 'pwa-core-test');
  const b = await secretKey(secret, salt, 'pwa-core-test');
  const key = await generateDataKey();
  const wrapped = await wrapDataKey(key, a);
  assert.equal(await sameKey(key, await unwrapDataKey(wrapped, b)), true);
});

test('zelfde geheim met andere HKDF-context levert geen bruikbare sleutel', async () => {
  const secret = randomBytes(32), salt = randomBytes(16);
  const a = await secretKey(secret, salt, 'app-a');
  const b = await secretKey(secret, salt, 'app-b');
  const wrapped = await wrapDataKey(await generateDataKey(), a);
  await assert.rejects(unwrapDataKey(wrapped, b));
});

test('sameKey vergelijkt sleutels op cryptografische inhoud', async () => {
  const a = await generateDataKey();
  const b = await generateDataKey();
  assert.equal(await sameKey(a, a), true);
  assert.equal(await sameKey(a, b), false);
});
