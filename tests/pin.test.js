import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyReleasePin } from '../tools/pin.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'pwa-core-pin-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'js/core'), { recursive: true });
  await mkdir(join(root, 'css'), { recursive: true });
  const files = {
    'js/core/example.js': 'export const example = true;\n',
    'css/base.css': ':root { color-scheme: light dark; }\n',
  };
  for (const [path, content] of Object.entries(files)) await writeFile(join(root, path), content);
  const manifest = {
    schemaVersion: 1,
    coreVersion: '1.0.0',
    releaseStatus: 'released',
    allowlist: Object.keys(files),
    checksums: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, hash(content)])),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(root, 'core-manifest.json'), manifestBytes);
  const pin = {
    schemaVersion: 1,
    repository: 'Gertjun/PWA-Core',
    version: '1.0.0',
    tag: 'v1.0.0',
    commit: 'a'.repeat(40),
    manifestSha256: hash(manifestBytes),
  };
  await writeFile(join(root, 'pwa-core.lock.json'), JSON.stringify(pin, null, 2) + '\n');
  return { root, pin, manifest, files };
}

test('accepteert een complete pin met manifest en lokale bestandshashes', async t => {
  const { root } = await fixture(t);
  const result = await verifyReleasePin({ root });
  assert.equal(result.tag, 'v1.0.0');
  assert.equal(result.files, 2);
});

test('weigert een afwijkende manifestchecksum', async t => {
  const { root, pin } = await fixture(t);
  pin.manifestSha256 = '0'.repeat(64);
  await writeFile(join(root, 'pwa-core.lock.json'), JSON.stringify(pin));
  await assert.rejects(verifyReleasePin({ root }), /manifestSha256/);
});

test('weigert een andere repository als releasebron', async t => {
  const { root, pin } = await fixture(t);
  pin.repository = 'someone/other-core';
  await writeFile(join(root, 'pwa-core.lock.json'), JSON.stringify(pin));
  await assert.rejects(verifyReleasePin({ root }), /owner/);
});

test('weigert een tag die niet bij de SemVer-versie hoort', async t => {
  const { root, pin } = await fixture(t);
  pin.tag = 'v1.0.1';
  await writeFile(join(root, 'pwa-core.lock.json'), JSON.stringify(pin));
  await assert.rejects(verifyReleasePin({ root }), /tag moet exact/);
});

test('weigert een afgekorte commit-SHA', async t => {
  const { root, pin } = await fixture(t);
  pin.commit = 'abc123';
  await writeFile(join(root, 'pwa-core.lock.json'), JSON.stringify(pin));
  await assert.rejects(verifyReleasePin({ root }), /volledige 40-teken/);
});

test('weigert een prereleaseversie als stabiele pin', async t => {
  const { root, pin } = await fixture(t);
  pin.version = '1.0.0-rc.1';
  pin.tag = 'v1.0.0-rc.1';
  await writeFile(join(root, 'pwa-core.lock.json'), JSON.stringify(pin));
  await assert.rejects(verifyReleasePin({ root }), /stabiele SemVer/);
});

test('weigert een manifest dat bij een andere versie hoort', async t => {
  const { root, manifest, pin } = await fixture(t);
  manifest.coreVersion = '1.1.0';
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  pin.manifestSha256 = hash(bytes);
  await writeFile(join(root, 'core-manifest.json'), bytes);
  await writeFile(join(root, 'pwa-core.lock.json'), JSON.stringify(pin));
  await assert.rejects(verifyReleasePin({ root }), /coreVersion/);
});

test('weigert gewijzigde lokale kernbestanden', async t => {
  const { root } = await fixture(t);
  await writeFile(join(root, 'js/core/example.js'), 'export const example = false;\n');
  await assert.rejects(verifyReleasePin({ root }), /checksum mismatch/);
});

test('weigert een unreleased manifest', async t => {
  const { root, manifest, pin } = await fixture(t);
  manifest.releaseStatus = 'unreleased';
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  pin.manifestSha256 = hash(bytes);
  await writeFile(join(root, 'core-manifest.json'), bytes);
  await writeFile(join(root, 'pwa-core.lock.json'), JSON.stringify(pin));
  await assert.rejects(verifyReleasePin({ root }), /released core-manifest/);
});

test('weigert symlinked kernbestanden', async t => {
  const { root } = await fixture(t);
  await unlink(join(root, 'js/core/example.js'));
  await symlink(join(root, 'css/base.css'), join(root, 'js/core/example.js'));
  await assert.rejects(verifyReleasePin({ root }), /Symlinks zijn niet toegestaan/);
});
