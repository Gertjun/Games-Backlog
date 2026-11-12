import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYSTEM_KEY, emptySyncState, collectDeletions, mergeSyncStates,
  registerDevice, acknowledgeDeletions, deactivateDevice, activeDevices,
  allDevicesAcknowledged, applyDeletionLedger, reconcileData, reconcileBackup,
} from '../js/core/deletions.js';

test('collectDeletions vindt tombstones in geneste collecties', () => {
  const data = { projects: [{ tasks: [{ id: 'task-1', deleted: true, updatedAt: 7 }] }] };
  assert.deepEqual(collectDeletions(data), { 'projects/tasks:task-1': 7 });
});

test('dezelfde record-ID in verschillende collecties blijft gescheiden', () => {
  const data = {
    projects: [{ id: 'same', deleted: true, updatedAt: 4 }],
    notes: [{ id: 'same', deleted: true, updatedAt: 9 }],
  };
  assert.deepEqual(collectDeletions(data), { 'projects:same': 4, 'notes:same': 9 });
});

test('mergeSyncStates combineert verwijderingen en bevestigingen monotone', () => {
  const merged = mergeSyncStates(
    { devices: { a: { createdAt: 1, lastSeenAt: 4, acknowledged: { 'items:x': 3 } } }, deletions: { 'items:x': 5 } },
    { devices: { a: { createdAt: 2, lastSeenAt: 8, acknowledged: { 'items:x': 7 } }, b: { createdAt: 6, acknowledged: {} } }, deletions: { 'items:x': 9, 'items:y': 2 } },
  );
  assert.deepEqual(merged.deletions, { 'items:x': 9, 'items:y': 2 });
  assert.equal(merged.devices.a.acknowledged['items:x'], 7);
  assert.equal(merged.devices.a.lastSeenAt, 8);
  assert.deepEqual(Object.keys(merged.devices).sort(), ['a', 'b']);
});

test('registerDevice bewaart historie en ververst lastSeen na een uur', () => {
  const state = { devices: { a: { createdAt: 10, lastSeenAt: 20, acknowledged: { 'items:x': 15 } } }, deletions: { 'items:x': 15 } };
  const unchanged = registerDevice(state, 'a', 20 + 30 * 60_000);
  assert.equal(unchanged.devices.a.lastSeenAt, 20);
  const refreshed = registerDevice(unchanged, 'a', 20 + 61 * 60_000);
  assert.equal(refreshed.devices.a.lastSeenAt, 20 + 61 * 60_000);
  assert.equal(refreshed.devices.a.acknowledged['items:x'], 15);
});

test('acknowledgeDeletions bevestigt alle actuele tombstones', () => {
  const state = { devices: { a: { createdAt: 1, acknowledged: {} } }, deletions: { 'items:x': 5, 'notes:y': 8 } };
  const next = acknowledgeDeletions(state, 'a', 10);
  assert.deepEqual(next.devices.a.acknowledged, { 'items:x': 5, 'notes:y': 8 });
  assert.equal(allDevicesAcknowledged(next, 'items:x'), true);
});

test('afgemelde apparaten tellen niet mee als actieve bevestigers', () => {
  let state = emptySyncState();
  state = registerDevice(state, 'a', 1);
  state = registerDevice(state, 'b', 2);
  state.deletions['items:x'] = 3;
  state = acknowledgeDeletions(state, 'a', 4);
  assert.equal(allDevicesAcknowledged(state, 'items:x'), false);
  state = deactivateDevice(state, 'b', 5);
  assert.deepEqual(activeDevices(state), ['a']);
  assert.equal(allDevicesAcknowledged(state, 'items:x'), true);
});

test('applyDeletionLedger verwijdert tombstone pas na bevestiging door alle actieve apparaten', () => {
  let state = emptySyncState();
  state = registerDevice(state, 'a', 1);
  state = registerDevice(state, 'b', 2);
  state.deletions['items:x'] = 3;
  const data = { items: [{ id: 'x', deleted: true, updatedAt: 3 }], [SYSTEM_KEY]: state };
  assert.equal(applyDeletionLedger(structuredClone(data)).items.length, 1);
  state = acknowledgeDeletions(state, 'a', 4);
  state = acknowledgeDeletions(state, 'b', 5);
  data[SYSTEM_KEY] = state;
  assert.deepEqual(applyDeletionLedger(structuredClone(data)).items, []);
});

test('reconcileData combineert app-data en legt verwijderhistorie opnieuw op', () => {
  const local = { items: [{ id: 'gone', deleted: true, updatedAt: 10 }], localOnly: true, [SYSTEM_KEY]: { version: 1, devices: {}, deletions: {} } };
  const remote = { items: [{ id: 'gone', title: 'oud', updatedAt: 1 }, { id: 'keep', title: 'behouden' }], remoteOnly: true };
  const merged = reconcileData(local, remote, (a, b) => ({ ...b, ...a, items: [...a.items, ...b.items] }));
  assert.equal(merged.localOnly, true);
  assert.equal(merged.remoteOnly, true);
  assert.deepEqual(merged.items.map(x => x.id), ['keep']);
  assert.equal(merged[SYSTEM_KEY].deletions['items:gone'], 10);
});

test('reconcileBackup behoudt actuele graveyard uit de huidige kluis', () => {
  const backup = { items: [{ id: 'gone', title: 'oud' }] };
  const current = { items: [], [SYSTEM_KEY]: { version: 1, devices: {}, deletions: { 'items:gone': 99 } } };
  const restored = reconcileBackup(backup, current);
  assert.deepEqual(restored.items, []);
  assert.equal(restored[SYSTEM_KEY].deletions['items:gone'], 99);
});
