import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing using Node's built-in scrypt (memory-hard, no native
 * dependency). Encoded as `scrypt$<salt-b64>$<hash-b64>` so the parameters
 * travel with the hash and can evolve without a schema change.
 */

const scryptAsync = promisify(scrypt);
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, 'base64');
  const derived = (await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length)) as Buffer;

  // Constant-time comparison to avoid leaking timing information.
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
