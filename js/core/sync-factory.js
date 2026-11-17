// Factory voor onafhankelijke synchronisatie per vault-instantie.
import { createClient, ConflictError } from './github.js';

export class UpdateRequiredError extends Error {
  constructor() {
    super('De gegevens op GitHub zijn gemaakt met een nieuwere versie van de app. Werk deze app eerst bij.');
    this.name = 'UpdateRequiredError';
  }
}

export function createSync({ vault, appName } = {}) {
  if (!vault || typeof vault.flush !== 'function' || typeof vault.getEnvelope !== 'function') throw new TypeError('Een geldige vault-instantie is vereist.');
  if (typeof appName !== 'string' || !appName.trim()) throw new TypeError('appName moet een niet-lege string zijn.');
// Synchronisatie van de kluis met één bestand op GitHub.
//
// - Niets veranderd op GitHub en lokaal ook niet      → klaar
// - Alleen lokaal veranderd                           → uploaden
// - Alleen op GitHub veranderd                        → downloaden
// - Beide veranderd                                   → app.merge(local, remote), dan uploaden
// - Back-up teruggezet (force)                        → verwijdergeschiedenis van remote blijft behouden
// - Gegevens op GitHub komen van een nieuwere app-versie → stoppen (UpdateRequiredError)
// Gelijktijdige wijziging tijdens het synchroniseren → automatisch opnieuw proberen.


let running = null;

const isSyncing = () => running !== null;

/**
 * @param {{settings, merge, migrate, schemaVersion}} opts
 * @returns {Promise<'up-to-date'|'uploaded'|'downloaded'|'merged'|'restored'>}
 */
function syncNow(opts) {
  if (!running) running = run(opts).finally(() => { running = null; });
  return running;
}

async function run(opts, attempt = 0) {
  const gh = createClient({ ...opts.settings, signal: opts.signal });
  try {
    return await once(gh, opts);
  } catch (err) {
    if (err instanceof ConflictError && attempt < 3) return run(opts, attempt + 1);
    throw err;
  }
}

async function upload(gh, sha, message) {
  await vault.flush();
  const rev = vault.getPersistedRevision();
  const newSha = await gh.putFile(vault.getEnvelope(), sha, `${appName}: ${message}`);
  vault.markSynced(newSha, rev);
}

async function once(gh, { merge, migrate = (d) => d, schemaVersion = Infinity }) {
  await vault.prepareSyncData();
  await vault.flush();
  const startRev = vault.getRevision();
  const meta = vault.getSyncMeta();
  const remote = await gh.getFile();

  if (!remote) {
    await upload(gh, null, 'kluis aangemaakt');
    return 'uploaded';
  }
  if (meta.force) {
    const currentRemote = await vault.decryptRemote(remote.envelope);
    if ((currentRemote?.schema ?? 0) > schemaVersion) throw new UpdateRequiredError();
    const restored = vault.reconcileRestoredBackup(currentRemote);
    await vault.adoptRemote(vault.getEnvelope(), restored, remote.sha, { keepLocal: true });
    await upload(gh, remote.sha, 'back-up hersteld met behouden verwijdergeschiedenis');
    return 'restored';
  }
  if (remote.sha === meta.sha) {
    if (!meta.dirty) {
      vault.updateSyncMeta({ lastSyncAt: Date.now() });
      return 'up-to-date';
    }
    await upload(gh, remote.sha, 'bijgewerkt');
    return 'uploaded';
  }

  const decrypted = await vault.decryptRemote(remote.envelope);
  if ((decrypted?.schema ?? 0) > schemaVersion) throw new UpdateRequiredError();
  const remoteData = !meta.dirty
    ? vault.reconcileRemoteData(decrypted, migrate)
    : vault.mergeRemoteData(decrypted, migrate, merge);

  // Lokaal gewijzigd terwijl we aan het ophalen waren? Dan opnieuw beginnen.
  if (vault.getRevision() !== startRev) throw new ConflictError();

  if (!meta.dirty) {
    await vault.adoptRemote(remote.envelope, remoteData, remote.sha, { keepLocal: true });
    await upload(gh, remote.sha, 'opgehaald en verwijdergeschiedenis bijgewerkt');
    return 'downloaded';
  }

  const merged = remoteData;
  await vault.adoptRemote(remote.envelope, merged, remote.sha, { keepLocal: true });
  await upload(gh, remote.sha, 'samengevoegd');
  return 'merged';
}

  return { isSyncing, syncNow, UpdateRequiredError };
}
