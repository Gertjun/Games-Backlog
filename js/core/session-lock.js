// Backwards-compatible singleton facade plus per-vault factory.
import { APP } from '../config.js';
import { createSessionLock } from './session-lock-factory.js';
const defaultLock = createSessionLock({ storagePrefix: APP.storagePrefix });
export { createSessionLock };
export const SessionLockUnavailableError = defaultLock.SessionLockUnavailableError;
export const SessionLockBusyError = defaultLock.SessionLockBusyError;
export const acquireSessionLock = (...args) => defaultLock.acquireSessionLock(...args);
export const hasSessionLock = (...args) => defaultLock.hasSessionLock(...args);
