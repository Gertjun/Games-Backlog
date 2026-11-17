import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCollections } from '../js/core/records.js';
import { SYSTEM_KEY, reconcileData } from '../js/core/deletions.js';

const deletionState = () => ({
  version: 1,
  devices: { current: { createdAt: 1, acknowledged: {} } },
  deletions: { 'games:seed-001': 200 },
});

function merge(local, remote) {
  return reconcileData(local, remote, (a, b) => ({
    ...b,
    ...a,
    games: mergeCollections(a.games, b.games),
  }));
}

test('een aantoonbaar nieuwer opnieuw aangemaakt game-record herleeft na verwijdering', () => {
  const local = {
    games: [{ id: 'seed-001', deleted: true, updatedAt: 200 }],
    [SYSTEM_KEY]: deletionState(),
  };
  const remote = {
    games: [{ id: 'seed-001', title: 'Opnieuw toegevoegd', updatedAt: 201 }],
  };

  const result = merge(local, remote);
  assert.deepEqual(result.games, [{ id: 'seed-001', title: 'Opnieuw toegevoegd', updatedAt: 201 }]);
  assert.equal(Object.hasOwn(result[SYSTEM_KEY].deletions, 'games:seed-001'), false);
});

test('gelijke, oudere of ontbrekende updatedAt herleeft niet (fail-closed)', () => {
  for (const record of [
    { id: 'seed-001', title: 'Gelijk', updatedAt: 200 },
    { id: 'seed-001', title: 'Ouder', updatedAt: 199 },
    { id: 'seed-001', title: 'Geen tijdstempel' },
  ]) {
    const local = { games: [], [SYSTEM_KEY]: deletionState() };
    const result = merge(local, { games: [record] });
    assert.deepEqual(result.games, []);
    assert.equal(result[SYSTEM_KEY].deletions['games:seed-001'], 200);
  }
});
