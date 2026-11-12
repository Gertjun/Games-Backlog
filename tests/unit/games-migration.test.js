import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; }
  setItem(key, value) { this[key] = String(value); }
  removeItem(key) { delete this[key]; }
  clear() { for (const key of Object.keys(this)) delete this[key]; }
}
globalThis.localStorage = new MemoryStorage();

const { app } = await import('../../js/app.js');
const {
  SYSTEM_KEY, emptySyncState, registerDevice, acknowledgeDeletions,
  reconcileData, applyDeletionLedger,
} = await import('../../js/core/deletions.js');

const oldTimestamp = Date.now() - 181 * 86_400_000;
const tombstone = id => ({ id, deleted: true, updatedAt: oldTimestamp });

function fixture() {
  return {
    schema: 9,
    games: [tombstone('old-game')],
    gameInfo: [tombstone('old-info')],
    [SYSTEM_KEY]: {
      version: 1,
      devices: {
        current: { createdAt: 1, lastSeenAt: 2, acknowledged: {} },
        'synthetic-offline-device': { createdAt: 1, lastSeenAt: 2, acknowledged: {} },
      },
      deletions: {},
    },
    appSpecificUnknownField: { keep: true },
  };
}

test('migrate behoudt tombstones ouder dan 180 dagen in games en gameInfo', () => {
  const migrated = app.migrate(fixture());

  assert.equal(migrated.schema, 9);
  assert.deepEqual(migrated.games, [tombstone('old-game')]);
  assert.deepEqual(migrated.gameInfo, [tombstone('old-info')]);
  assert.deepEqual(migrated[SYSTEM_KEY].devices['synthetic-offline-device'].acknowledged, {});
  assert.deepEqual(migrated.appSpecificUnknownField, { keep: true });
});

test('Core-verwijderledger houdt oude tombstones vast tot het offline apparaat bevestigt', () => {
  const local = app.migrate(fixture());
  const remote = { schema: 9, games: [], gameInfo: [] };

  let merged = reconcileData(local, remote, app.merge);
  assert.equal(merged.games.length, 1);
  assert.equal(merged.gameInfo.length, 1);
  assert.equal(merged[SYSTEM_KEY].deletions['games:old-game'], oldTimestamp);
  assert.equal(merged[SYSTEM_KEY].deletions['gameInfo:old-info'], oldTimestamp);

  let state = acknowledgeDeletions(merged[SYSTEM_KEY], 'current', Date.now());
  merged[SYSTEM_KEY] = state;
  merged = applyDeletionLedger(merged);
  assert.equal(merged.games.length, 1);
  assert.equal(merged.gameInfo.length, 1);

  state = acknowledgeDeletions(state, 'synthetic-offline-device', Date.now());
  merged[SYSTEM_KEY] = state;
  merged = applyDeletionLedger(merged);
  assert.equal(merged.games.length, 0);
  assert.equal(merged.gameInfo.length, 0);
});

test('graveyard voorkomt dat een ouder apparaat een verwijderde game opnieuw toevoegt', () => {
  const local = {
    schema: 9, games: [], gameInfo: [],
    [SYSTEM_KEY]: {
      version: 1,
      devices: { current: { createdAt: 1, acknowledged: {} }, offline: { createdAt: 1, acknowledged: {} } },
      deletions: { 'games:removed-game': oldTimestamp, 'gameInfo:removed-info': oldTimestamp },
    },
  };
  const staleRemote = {
    schema: 9,
    games: [{ id: 'removed-game', title: 'Oude game', updatedAt: Date.now() }],
    gameInfo: [{ id: 'removed-info', title: 'Oude metadata', updatedAt: Date.now() }],
  };

  const merged = reconcileData(local, staleRemote, app.merge);
  assert.deepEqual(merged.games, []);
  assert.deepEqual(merged.gameInfo, []);
  assert.equal(merged[SYSTEM_KEY].deletions['games:removed-game'], oldTimestamp);
  assert.equal(merged[SYSTEM_KEY].deletions['gameInfo:removed-info'], oldTimestamp);
});
