/**
 * AES-256-GCM шифрование паролей для avito_browser_sessions.
 *
 * v2 — per-user ключ через HKDF (userId как info).
 * v1 (legacy) — общий ключ SHA-256(SUPABASE_SERVICE_ROLE_KEY).
 *
 * Формат:
 *   v1: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *   v2: "v2:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 бит — рекомендован для GCM
const HKDF_SALT = "avito-session-encryption-v2";
const V2_PREFIX = "v2:";

/** Legacy ключ (v1) — одинаковый для всех пользователей */
function getLegacyKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHash("sha256").update(secret).digest();
}

/** Per-user ключ (v2) через HKDF — уникальный для каждого userId */
function getUserKey(userId: string): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  const ikm = Buffer.from(secret, "utf8");
  const salt = Buffer.from(HKDF_SALT, "utf8");
  const info = Buffer.from(userId, "utf8");

  return Buffer.from(hkdfSync("sha256", ikm, salt, info, 32));
}

export function encryptPassword(plain: string, userId: string): string {
  const key = getUserKey(userId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${V2_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPassword(enc: string, userId: string): string {
  let key: Buffer;
  let payload: string;

  if (enc.startsWith(V2_PREFIX)) {
    key = getUserKey(userId);
    payload = enc.slice(V2_PREFIX.length);
  } else {
    // v1 legacy — обратная совместимость
    key = getLegacyKey();
    payload = enc;
  }

  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted password format");
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Перешифровывает пароль из v1 (legacy) в v2 (per-user HKDF).
 * Возвращает новую зашифрованную строку или null если уже v2.
 */
export function migratePasswordEncryption(enc: string, userId: string): string | null {
  if (enc.startsWith(V2_PREFIX)) return null;

  const plain = decryptPassword(enc, userId);
  return encryptPassword(plain, userId);
}
