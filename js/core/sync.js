// Synchronisatie van de kluis met één bestand op GitHub.
//
// - Niets veranderd op GitHub en lokaal ook niet      → klaar
// - Alleen lokaal veranderd                           → uploaden
// - Alleen op GitHub veranderd                        → downloaden
// - Beide veranderd                                   → app.merge(local, remote), dan uploaden
// - Back-up teruggezet (force)                        → lokale versie overschrijft GitHub
// - Gegevens op GitHub komen van een nieuwere app-versie → stoppen (UpdateRequiredError)
// Gelijktijdige wijziging tijdens het synchroniseren → automatisch opnieuw proberen.

import { APP } from '../config.js';
import * as vault from './vault.js';
import { createClient, ConflictError } from './github.js';

export class UpdateRequiredError extends Error {
  constructor() {
    super('De gegevens op GitHub zijn gemaakt met een nieuwere versie van de app. Werk deze app eerst bij.');
    this.name = 'UpdateRequiredError';
  }
}

let running = null;

export const isSyncing = () => running !== null;

/**
 * @param {{settings, merge, migrate, schemaVersion}} opts
 * @returns {Promise<'up-to-date'|'uploaded'|'downloaded'|'merged'|'restored'>}
 */
export function syncNow(opts) {
  if (!running) running = run(opts).finally(() => { running = null; });
  return running;
}

async function run(opts, attempt = 0) {
  const gh = createClient(opts.settings);
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
  const newSha = await gh.putFile(vault.getEnvelope(), sha, `${APP.name}: ${message}`);
  vault.markSynced(newSha, rev);
}

async function once(gh, { merge, migrate = (d) => d, schemaVersion = Infinity }) {
  await vault.flush();
  const startRev = vault.getRevision();
  const meta = vault.getSyncMeta();
  const remote = await gh.getFile();

  if (!remote) {
    await upload(gh, null, 'kluis aangemaakt');
    return 'uploaded';
  }
  if (meta.force) {
    await upload(gh, remote.sha, 'back-up teruggezet');
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
  const remoteData = migrate(decrypted);

  // Lokaal gewijzigd terwijl we aan het ophalen waren? Dan opnieuw beginnen.
  if (vault.getRevision() !== startRev) throw new ConflictError();

  if (!meta.dirty) {
    await vault.adoptRemote(remote.envelope, remoteData, remote.sha, { keepLocal: false });
    vault.updateSyncMeta({ lastSyncAt: Date.now() });
    return 'downloaded';
  }

  const merged = merge(vault.getData(), remoteData);
  await vault.adoptRemote(remote.envelope, merged, remote.sha, { keepLocal: true });
  await upload(gh, remote.sha, 'samengevoegd');
  return 'merged';
}
