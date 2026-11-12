import test from 'node:test';
import assert from 'node:assert/strict';
import { newRecord, alive, findById, updateById, removeById, mergeCollections, purgeTombstones } from '../js/core/records.js';

test('newRecord maakt unieke IDs en tijdstempels aan', () => {
  const a = newRecord({ title: 'A' });
  const b = newRecord({ title: 'B' });
  assert.ok(a.id && b.id && a.id !== b.id);
  assert.equal(a.createdAt, a.updatedAt);
  assert.equal(a.title, 'A');
});

test('alive en findById verbergen tombstones', () => {
  const rows = [{ id: 'a' }, { id: 'b', deleted: true }];
  assert.deepEqual(alive(rows), [{ id: 'a' }]);
  assert.equal(findById(rows, 'b'), undefined);
  assert.equal(findById(rows, 'a').id, 'a');
  assert.deepEqual(alive(null), []);
});

test('updateById wijzigt alleen het bedoelde record en actualiseert updatedAt', () => {
  const rows = [{ id: 'a', title: 'oud', updatedAt: 1 }, { id: 'b', title: 'blijft' }];
  const updated = updateById(rows, 'a', { title: 'nieuw' });
  assert.equal(updated.title, 'nieuw');
  assert.ok(updated.updatedAt >= 1);
  assert.equal(rows[1].title, 'blijft');
  assert.equal(updateById(rows, 'missing', {}), undefined);
});

test('removeById schrijft een tombstone in plaats van fysiek verwijderen', () => {
  const rows = [{ id: 'a', title: 'te verwijderen' }];
  removeById(rows, 'a');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deleted, true);
  assert.equal(rows[0].id, 'a');
  assert.ok(rows[0].updatedAt > 0);
});

test('mergeCollections behoudt unieke records van beide kanten', () => {
  const result = mergeCollections([{ id: 'local' }], [{ id: 'remote' }]);
  assert.deepEqual(new Set(result.map(x => x.id)), new Set(['local', 'remote']));
});

test('mergeCollections kiest de nieuwste updatedAt', () => {
  const result = mergeCollections(
    [{ id: 'x', value: 'local-old', updatedAt: 4 }],
    [{ id: 'x', value: 'remote-new', updatedAt: 5 }],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].value, 'remote-new');
});

test('mergeCollections kiest lokaal bij gelijke updatedAt', () => {
  const result = mergeCollections(
    [{ id: 'x', value: 'local', updatedAt: 5 }],
    [{ id: 'x', value: 'remote', updatedAt: 5 }],
  );
  assert.equal(result[0].value, 'local');
});

test('purgeTombstones verwijdert alleen oude tombstones', () => {
  const now = Date.now();
  const rows = [
    { id: 'alive', updatedAt: 1 },
    { id: 'old', deleted: true, updatedAt: now - 100 * 86_400_000 },
    { id: 'recent', deleted: true, updatedAt: now - 2 * 86_400_000 },
  ];
  assert.deepEqual(purgeTombstones(rows, 90).map(x => x.id), ['alive', 'recent']);
});
