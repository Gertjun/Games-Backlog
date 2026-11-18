// Compatibele app-adapter rond het ene generieke Core-pairingprotocol.
// QR en handmatige code gebruiken exact dezelfde envelop en cryptografische implementatie.
import {
  createPairingCode,
  openPairingCode,
  markPairingUsed,
  PAIRING_TTL_MS,
  PAIRING_KDF_ITERATIONS,
} from './pair.js';

export async function createPairingPayload({ syncConfig, pin, context, now, transport = 'qr' } = {}) {
  return createPairingCode({ syncConfig, pin, context, now, transport });
}

export async function openPairingPayload({ payload, pin, context, now, transport = 'qr' } = {}) {
  return openPairingCode({ payload, pin, context, now, transport });
}

export { markPairingUsed };
export const DEVICE_PAIRING_TTL_MS = PAIRING_TTL_MS;
export const DEVICE_PAIRING_KDF_ITERATIONS = PAIRING_KDF_ITERATIONS;
