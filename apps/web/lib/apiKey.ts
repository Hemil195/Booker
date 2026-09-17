// apps/web/lib/apiKey.ts
// Shared API key generation, hashing, and verification logic.
// Keys are NEVER stored in plaintext after being shown once.
// Hash: HMAC-SHA256 with API_KEY_HASH_SECRET pepper.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Generate a cryptographically random 64-char hex API key.
 * Call once; show to user once; store only the hash.
 */
export function generateApiKey(): string {
  return randomBytes(32).toString("hex");
}

/**
 * HMAC-SHA256 hash of a raw key.
 * This is what gets stored in the database.
 */
export function hashApiKey(rawKey: string): string {
  const secret = process.env.API_KEY_HASH_SECRET;
  if (!secret) throw new Error("API_KEY_HASH_SECRET env var is required");
  return createHmac("sha256", secret).update(rawKey).digest("hex");
}

/**
 * Timing-safe comparison of two hex digests.
 */
export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  const computed = hashApiKey(rawKey);
  if (computed.length !== storedHash.length) return false;
  return timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(storedHash, "hex"),
  );
}

/**
 * Generate a 6-digit numeric linking code (zero-padded).
 */
export function generateLinkingCode(): string {
  // 100000..999999
  return String(Math.floor(100000 + Math.random() * 900000));
}
