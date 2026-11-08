// Hulpfuncties voor lijsten met records die over apparaten heen samengevoegd
// kunnen worden. Elk record heeft: id, createdAt, updatedAt en eventueel
// deleted: true (een "tombstone" — zo weet een ander apparaat dat het weg is).
//
// Regel: verwijder records NOOIT echt uit een lijst, gebruik removeById().

export function newRecord(fields = {}) {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...fields };
}

/** Alleen de niet-verwijderde records. */
export const alive = (list) => (list || []).filter((r) => !r.deleted);

export const findById = (list, id) => (list || []).find((r) => r.id === id && !r.deleted);

/** Wijzigt een record in de lijst (muteert) en zet updatedAt. */
export function updateById(list, id, changes) {
  const rec = list.find((r) => r.id === id);
  if (rec) Object.assign(rec, changes, { updatedAt: Date.now() });
  return rec;
}

/** Vervangt het record door een tombstone (muteert). */
export function removeById(list, id) {
  const i = list.findIndex((r) => r.id === id);
  if (i >= 0) list[i] = { id, deleted: true, updatedAt: Date.now() };
}

/** Per id wint het record met de nieuwste updatedAt. */
export function mergeCollections(local = [], remote = []) {
  const map = new Map();
  for (const r of remote) map.set(r.id, r);
  for (const r of local) {
    const other = map.get(r.id);
    if (!other || (r.updatedAt || 0) >= (other.updatedAt || 0)) map.set(r.id, r);
  }
  return [...map.values()];
}

/** Ruimt tombstones op die ouder zijn dan `days` dagen. */
export function purgeTombstones(list, days = 90) {
  const cutoff = Date.now() - days * 86_400_000;
  return (list || []).filter((r) => !r.deleted || r.updatedAt > cutoff);
}
