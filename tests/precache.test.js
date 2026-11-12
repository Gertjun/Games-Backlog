import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parsePrecache, validatePrecache } from '../tools/precache.mjs';

async function fixture({ allowlist = ['js/core/shell.js', 'css/base.css'], entries = ['./js/core/shell.js', './css/base.css'] } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'pwa-precache-'));
  await mkdir(path.join(root, 'js', 'core'), { recursive: true });
  await mkdir(path.join(root, 'css'), { recursive: true });
  await writeFile(path.join(root, 'js/core/shell.js'), '// synthetic');
  await writeFile(path.join(root, 'css/base.css'), '/* synthetic */');
  await writeFile(path.join(root, 'core-manifest.json'), JSON.stringify({ coreVersion: '1.2.3', allowlist }));
  await writeFile(path.join(root, 'sw.js'), `const VERSION = '1.0.0';\nconst PRECACHE = [\n  ${entries.map((entry) => JSON.stringify(entry)).join(',\n  ')}\n];\n`);
  return root;
}

test('parsePrecache leest enkele en dubbele quotes en negeert commentaar', () => {
  const source = `
    // comment
    const PRECACHE = [
      './index.html',
      "./js/core/shell.js", // inline comment
      /* block comment */
      './css/base.css',
    ];
  `;
  assert.deepEqual(parsePrecache(source), ['./index.html', './js/core/shell.js', './css/base.css']);
});

test('parsePrecache weigert dynamische expressies en ontbrekende array', () => {
  assert.throws(() => parsePrecache('const PRECACHE = [basePath + "app.js"];'), /uitsluitend statische stringpaden/i);
  assert.throws(() => parsePrecache('self.addEventListener("install", () => {});'), /geen statische PRECACHE-array/i);
  assert.throws(() => parsePrecache('const PRECACHE = ["a.js" "b.js"];'), /uitsluitend statische stringpaden/i);
});

test('validatePrecache accepteert complete lokale allowlist', async () => {
  const root = await fixture();
  try {
    const result = await validatePrecache({ root });
    assert.equal(result.checked, 2);
    assert.equal(result.manifestVersion, '1.2.3');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validatePrecache detecteert ontbrekend precache-bestand', async () => {
  const root = await fixture({ entries: ['./js/core/shell.js'] });
  try {
    await assert.rejects(validatePrecache({ root }), /css\/base\.css/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validatePrecache detecteert ontbrekend lokaal bestand', async () => {
  const root = await fixture({ allowlist: ['js/core/missing.js'], entries: ['./js/core/missing.js'] });
  try {
    await assert.rejects(validatePrecache({ root }), /bestand ontbreekt/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validatePrecache weigert dubbele entries en remote paden', async () => {
  const duplicate = await fixture({ entries: ['./js/core/shell.js', './js/core/shell.js', './css/base.css'] });
  try {
    await assert.rejects(validatePrecache({ root: duplicate }), /dubbele PRECACHE/i);
  } finally {
    await rm(duplicate, { recursive: true, force: true });
  }

  const remote = await fixture({ entries: ['https://example.invalid/shell.js', './css/base.css'] });
  try {
    await assert.rejects(validatePrecache({ root: remote }), /relatief/i);
  } finally {
    await rm(remote, { recursive: true, force: true });
  }
});
