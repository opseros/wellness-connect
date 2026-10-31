import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Application-level encryption for medical reports (on top of the storage
 * provider's own encryption). AES-256-GCM; a stored file is
 * [12-byte IV][16-byte auth tag][ciphertext].
 *
 * The key is REPORTS_ENCRYPTION_KEY (32 bytes, base64). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * In production the app refuses to store or read reports without it. Outside
 * production a key is derived from BETTER_AUTH_SECRET so development works.
 * Losing or changing the key makes existing reports unreadable.
 */
function key(): Buffer {
  const raw = process.env.REPORTS_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("REPORTS_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return k;
  }
  if (process.env.VERCEL_ENV === "production") throw new Error("REPORTS_ENCRYPTION_KEY is not set");
  return createHash("sha256").update(`${process.env.BETTER_AUTH_SECRET ?? "dev"}:care-reports`).digest();
}

export function encryptFile(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decryptFile(stored: Buffer): Buffer {
  if (stored.length < 28) throw new Error("Encrypted file is too short");
  const d = createDecipheriv("aes-256-gcm", key(), stored.subarray(0, 12));
  d.setAuthTag(stored.subarray(12, 28));
  return Buffer.concat([d.update(stored.subarray(28)), d.final()]);
}
