// Generieke, blijvende verwijderadministratie voor alle template-apps.
export const SYSTEM_KEY = '__pwaSync';
export function emptySyncState() { return { version: 1, devices: {}, deletions: {} }; }
export function collectDeletions(value, path = [], found = {}) {
  if (Array.isArray(value)) { for (const item of value) collectDeletions(item, path, found); return found; }
  if (!value || typeof value !== 'object') return found;
  if (value.deleted === true && typeof value.id === 'string' && value.id) {
    const key = `${path.join('/') }:${value.id}`;
    found[key] = Math.max(found[key] || 0, Number(value.updatedAt) || 0);
    return found;
  }
  for (const [key, child] of Object.entries(value)) if (key !== SYSTEM_KEY) collectDeletions(child, [...path, key], found);
  return found;
}
export function mergeSyncStates(local, remote) {
  const a = local && typeof local === 'object' ? local : emptySyncState();
  const b = remote && typeof remote === 'object' ? remote : emptySyncState();
  const out = emptySyncState();
  for (const key of new Set([...Object.keys(a.deletions || {}), ...Object.keys(b.deletions || {})])) {
    out.deletions[key] = Math.max(Number(a.deletions?.[key]) || 0, Number(b.deletions?.[key]) || 0);
  }
  for (const id of new Set([...Object.keys(a.devices || {}), ...Object.keys(b.devices || {})])) {
    const x = a.devices?.[id] || {}, y = b.devices?.[id] || {};
    const acknowledgements = {};
    for (const key of new Set([...Object.keys(x.acknowledged || {}), ...Object.keys(y.acknowledged || {})])) {
      acknowledgements[key] = Math.max(Number(x.acknowledged?.[key]) || 0, Number(y.acknowledged?.[key]) || 0);
    }
    const createdAt = Math.min(Number(x.createdAt) || Infinity, Number(y.createdAt) || Infinity);
    const deactivatedAt = Math.min(Number(x.deactivatedAt) || Infinity, Number(y.deactivatedAt) || Infinity);
    out.devices[id] = { createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(), lastSeenAt: Math.max(Number(x.lastSeenAt) || 0, Number(y.lastSeenAt) || 0), acknowledged: acknowledgements };
    if (Number.isFinite(deactivatedAt)) out.devices[id].deactivatedAt = deactivatedAt;
  }
  return out;
}
export function registerDevice(state, deviceId, now = Date.now()) {
  if (!deviceId) throw new Error('Apparaat-ID ontbreekt.');
  const next = mergeSyncStates(state, null);
  const device = next.devices[deviceId] || { createdAt: now, acknowledged: {} };
  if (device.deactivatedAt) throw new Error('Dit apparaat is afgemeld en kan niet opnieuw synchroniseren.');
  if (!device.lastSeenAt || now - device.lastSeenAt >= 3_600_000) device.lastSeenAt = now;
  device.acknowledged ||= {}; next.devices[deviceId] = device;
  return next;
}
export function acknowledgeDeletions(state, deviceId, now = Date.now()) {
  const next = registerDevice(state, deviceId, now), device = next.devices[deviceId];
  for (const key of Object.keys(next.deletions)) device.acknowledged[key] = Math.max(device.acknowledged[key] || 0, next.deletions[key] || now);
  return next;
}
export function deactivateDevice(state, deviceId, now = Date.now()) {
  const next = mergeSyncStates(state, null);
  if (!next.devices[deviceId]) throw new Error('Onbekend apparaat.');
  next.devices[deviceId].deactivatedAt = now;
  return next;
}
export function activeDevices(state) { return Object.entries(state?.devices || {}).filter(([, d]) => !d.deactivatedAt).map(([id]) => id); }
export function allDevicesAcknowledged(state, key) {
  return activeDevices(state).every((id) => Number(state.devices[id].acknowledged?.[key]) >= Number(state.deletions?.[key]));
}
export function applyDeletionLedger(data) {
  const state = data?.[SYSTEM_KEY] || emptySyncState();
  const visit = (value, path = []) => {
    if (Array.isArray(value)) return value.filter((item) => {
      const key = item && typeof item.id === 'string' ? `${path.join('/') }:${item.id}` : '';
      if (item?.deleted === true && key && allDevicesAcknowledged(state, key)) return false;
      if (!item?.deleted && key && Object.hasOwn(state.deletions, key)) return false;
      return true;
    }).map((item) => visit(item, path));
    if (!value || typeof value !== 'object') return value;
    for (const [key, child] of Object.entries(value)) if (key !== SYSTEM_KEY) value[key] = visit(child, [...path, key]);
    return value;
  };
  return visit(data);
}
function mergeDeletionHistory(state, ...sources) {
  for (const source of sources) {
    for (const [key, time] of Object.entries(collectDeletions(source || {}))) {
      state.deletions[key] = Math.max(Number(state.deletions[key]) || 0, Number(time) || 0);
    }
  }
  return state;
}
export function reconcileData(local, remote, appMerge = (a) => a) {
  const merged = appMerge(local || {}, remote || {}) || {};
  const state = mergeSyncStates(local?.[SYSTEM_KEY], remote?.[SYSTEM_KEY]);
  mergeDeletionHistory(state, local, remote, merged);
  merged[SYSTEM_KEY] = state;
  return applyDeletionLedger(merged);
}
export function reconcileBackup(backup, current) {
  const restored = structuredClone(backup || {});
  const state = mergeSyncStates(backup?.[SYSTEM_KEY], current?.[SYSTEM_KEY]);
  mergeDeletionHistory(state, backup, current);
  restored[SYSTEM_KEY] = state;
  return applyDeletionLedger(restored);
}
