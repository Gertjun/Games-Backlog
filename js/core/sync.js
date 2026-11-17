// Backwards-compatible singleton facade plus per-vault sync factory.
import { APP } from '../config.js';
import * as vault from './vault.js';
import { createSync, UpdateRequiredError } from './sync-factory.js';
const defaultSync = createSync({ vault, appName: APP.name });
export { createSync, UpdateRequiredError };
export const isSyncing = (...args) => defaultSync.isSyncing(...args);
export const syncNow = (...args) => defaultSync.syncNow(...args);
