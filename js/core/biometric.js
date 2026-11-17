// Backwards-compatible singleton facade plus per-vault factory.
import { APP } from '../config.js';
import { createBiometric } from './biometric-factory.js';
const defaultBiometric = createBiometric({ storagePrefix: APP.storagePrefix, appName: APP.name });
export { createBiometric };
export const isSupported = (...args) => defaultBiometric.isSupported(...args);
export const isEnrolled = (...args) => defaultBiometric.isEnrolled(...args);
export const disable = (...args) => defaultBiometric.disable(...args);
export const enroll = (...args) => defaultBiometric.enroll(...args);
export const enrollExisting = (...args) => defaultBiometric.enrollExisting(...args);
export const unlock = (...args) => defaultBiometric.unlock(...args);
