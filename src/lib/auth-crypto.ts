import crypto from 'crypto';

/**
 * Hash a plaintext password using scrypt with a random 16-byte salt.
 * Result format: scrypt$<salt_hex>$<derived_key_hex>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored hash or legacy plaintext.
 * Uses timing-safe comparisons to prevent side-channel timing attacks.
 */
export function verifyPassword(password: string, storedHashOrPlain: string): boolean {
  if (!password || !storedHashOrPlain) return false;

  const trimmedPassword = password.trim();
  const trimmedStored = storedHashOrPlain.trim();

  // Modern hashed format
  if (trimmedStored.startsWith('scrypt$')) {
    const parts = trimmedStored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHashHex] = parts;
    const derivedKey = crypto.scryptSync(trimmedPassword, salt, 64);
    const expectedBuffer = Buffer.from(expectedHashHex, 'hex');
    if (derivedKey.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(derivedKey, expectedBuffer);
  }

  // Legacy plaintext fallback (compared via timingSafeEqual on fixed-length SHA-256 digests)
  const hashA = crypto.createHash('sha256').update(trimmedPassword).digest();
  const hashB = crypto.createHash('sha256').update(trimmedStored).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}
