import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

// Gebruik geïsoleerde modules/configuratie en een nep-GitHub Contents API.
const root = await mkdtemp(path.join(tmpdir(), 'pwa-core-sync-'));
await mkdir(path.join(root, 'js', 'core'), { recursive: true });
for (const file of ['sync.js', 'vault.js', 'github.js', 'crypto.js', 'deletions.js']) {
  await cp(new URL(`../js/core/${file}`, import.meta.url), path.join(root, 'js', 'core', file));
}
await writeFile(path.join(root, 'js', 'config.js'), `
export const APP = { name: 'PWA-Core test', storagePrefix: 'sync-contract-test', kdfIterations: 1000 };
`);

class MemoryStorage {
  getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; }
  setItem(key, value) { this[key] = String(value); }
  removeItem(key) { delete this[key]; }
  clear() { for (const key of Object.keys(this)) delete this[key]; }
}
globalThis.localStorage = new MemoryStorage();
globalThis.crypto ??= webcrypto;

const vault = await import(pathToFileURL(path.join(root, 'js', 'core', 'vault.js')).href);
const sync = await import(pathToFileURL(path.join(root, 'js', 'core', 'sync.js')).href);
const crypto = await import(pathToFileURL(path.join(root, 'js', 'core', 'crypto.js')).href);
const originalFetch = globalThis.fetch;
const settings = { owner: 'synthetic-owner', repo: 'synthetic-data', branch: 'main', path: 'app/vault.json', token: 'synthetic-token' };
const password = 'synthetic-sync-passphrase';
const initialData = () => ({ schema: 1, records: [{ id: 'local', value: 'initial' }] });

function response(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function remoteResponse(envelope, sha = 'remote-sha') {
  return response({ sha, encoding: 'base64', content: Buffer.from(JSON.stringify(envelope, null, 2)).toString('base64') });
}

async function clean() {
  globalThis.fetch = originalFetch;
  await vault.reset();
  localStorage.clear();
}

async function prepareCleanVault() {
  await vault.create(password, initialData());
  await vault.prepareSyncData();
  await vault.flush();
  vault.setSyncMeta({ sha: 'base-sha', dirty: false, keyDirty: false, force: false, lastSyncAt: null });
}

async function makeRemote(data) {
  const envelope = structuredClone(vault.getEnvelope());
  envelope.payload = await crypto.encryptJSON(data, vault.getDataKey());
  envelope.updatedAt += 1;
  return envelope;
}

function installApi({ get, put }) {
  const calls = { get: 0, put: [] };
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      calls.put.push({ url, body });
      return put ? await put(body, calls) : response({ content: { sha: 'uploaded-sha' } });
    }
    calls.get++;
    return get ? await get(url, calls) : response(null, 404);
  };
  return calls;
}

test('eerste synchronisatie uploadt een nieuwe kluis als remote bestand ontbreekt', async () => {
  await clean();
  await prepareCleanVault();
  const calls = installApi({});
  const result = await sync.syncNow({ settings, merge: (local) => local, schemaVersion: 1 });

  assert.equal(result, 'uploaded');
  assert.equal(calls.get, 1);
  assert.equal(calls.put.length, 1);
  assert.equal(calls.put[0].body.message, 'PWA-Core test: kluis aangemaakt');
  assert.equal(calls.put[0].body.sha, undefined);
  const uploaded = JSON.parse(Buffer.from(calls.put[0].body.content, 'base64').toString('utf8'));
  assert.equal(uploaded.format, 'pwa-vault');
  assert.equal(uploaded.payload.data.includes('initial'), false);
  assert.equal(vault.getSyncMeta().dirty, false);
});

test('alleen lokale wijzigingen worden met de bekende remote SHA geüpload', async () => {
  await clean();
  await prepareCleanVault();
  await vault.setData({ schema: 1, records: [{ id: 'local', value: 'changed-local' }] });
  const current = structuredClone(vault.getEnvelope());
  const calls = installApi({
    get: async () => remoteResponse(current, 'base-sha'),
  });

  const result = await sync.syncNow({ settings, merge: (local) => local, schemaVersion: 1 });
  assert.equal(result, 'uploaded');
  assert.equal(calls.put.length, 1);
  assert.equal(calls.put[0].body.sha, 'base-sha');
});

test('alleen remote wijzigingen worden veilig overgenomen en teruggeschreven', async () => {
  await clean();
  await prepareCleanVault();
  const remote = await makeRemote({ schema: 1, records: [{ id: 'remote', value: 'from-remote' }] });
  const calls = installApi({ get: async () => remoteResponse(remote, 'new-remote-sha') });

  const result = await sync.syncNow({ settings, merge: (local) => local, schemaVersion: 1 });
  assert.equal(result, 'downloaded');
  assert.equal(vault.getData().records[0].value, 'from-remote');
  assert.equal(calls.put.length, 1);
  assert.equal(calls.put[0].body.sha, 'new-remote-sha');
});

test('gelijktijdige lokale en remote wijzigingen gebruiken de app-merge en uploaden het resultaat', async () => {
  await clean();
  await prepareCleanVault();
  await vault.setData({ schema: 1, records: [{ id: 'local', value: 'from-local' }] });
  const remote = await makeRemote({ schema: 1, records: [{ id: 'remote', value: 'from-remote' }] });
  const calls = installApi({ get: async () => remoteResponse(remote, 'new-remote-sha') });

  const result = await sync.syncNow({
    settings,
    merge: (local, remoteData) => ({
      ...local,
      records: [...local.records, ...remoteData.records],
      mergedByTest: true,
    }),
    schemaVersion: 1,
  });
  assert.equal(result, 'merged');
  assert.deepEqual(vault.getData().records.map((item) => item.value), ['from-local', 'from-remote']);
  assert.equal(vault.getData().mergedByTest, true);
  assert.equal(calls.put.length, 1);
  assert.equal(calls.put[0].body.sha, 'new-remote-sha');
});

test('remote schema hoger dan de app-versie blokkeert synchronisatie zonder upload', async () => {
  await clean();
  await prepareCleanVault();
  const remote = await makeRemote({ schema: 99, records: [] });
  const calls = installApi({ get: async () => remoteResponse(remote, 'future-sha') });

  await assert.rejects(
    sync.syncNow({ settings, merge: (local) => local, schemaVersion: 1 }),
    (error) => error.name === 'UpdateRequiredError',
  );
  assert.equal(calls.put.length, 0);
  assert.equal(vault.getSyncMeta().sha, 'base-sha');
});

test('GitHub 409-conflict triggert een beperkte retry', async () => {
  await clean();
  await prepareCleanVault();
  let putAttempts = 0;
  const calls = installApi({
    put: async () => {
      putAttempts++;
      return putAttempts === 1 ? response({ message: 'conflict' }, 409) : response({ content: { sha: 'retry-success-sha' } });
    },
  });

  const result = await sync.syncNow({ settings, merge: (local) => local, schemaVersion: 1 });
  assert.equal(result, 'uploaded');
  assert.equal(putAttempts, 2);
  assert.equal(calls.get, 2);
  assert.equal(vault.getSyncMeta().sha, 'retry-success-sha');
});

test('gelijktijdige sync-aanroepen delen één lopende operatie', async () => {
  await clean();
  await prepareCleanVault();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = installApi({
    get: async () => {
      await gate;
      return response(null, 404);
    },
  });

  const first = sync.syncNow({ settings, merge: (local) => local, schemaVersion: 1 });
  const second = sync.syncNow({ settings, merge: (local) => local, schemaVersion: 1 });
  assert.equal(first, second);
  release();
  assert.equal(await first, 'uploaded');
  assert.equal(calls.get, 1);
});

test('ontbrekende GitHub-instellingen worden veilig geweigerd vóór netwerkverkeer', async () => {
  await clean();
  await prepareCleanVault();
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; return response(null, 404); };

  await assert.rejects(
    sync.syncNow({ settings: { owner: 'owner', repo: 'repo', path: 'vault.json' }, merge: (local) => local }),
    /instellingen zijn onvolledig/i,
  );
  assert.equal(networkCalls, 0);
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  await rm(root, { recursive: true, force: true });
});
