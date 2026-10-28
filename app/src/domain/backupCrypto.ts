import { base64urlDecode, base64urlEncode } from "@smloyalty/license-core";

export const PBKDF2_ITERATIONS = 600_000;
const enc = new TextEncoder();

export interface EncryptedBackupFile {
  format: "smloyalty-backup-encrypted";
  formatVersion: 1;
  kdf: { name: "PBKDF2-SHA256"; iterations: number; salt: string };
  cipher: { name: "AES-256-GCM"; iv: string };
  /** Non-secret hints so the file can be recognised before decrypting. */
  meta: { appVersion: string; exportedAt: string };
  ciphertext: string;
}

const bytes = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function aad(f: Pick<EncryptedBackupFile, "format" | "formatVersion" | "kdf" | "cipher" | "meta">): ArrayBuffer {
  return bytes(enc.encode(JSON.stringify({ format: f.format, formatVersion: f.formatVersion, kdf: f.kdf, cipher: f.cipher, meta: f.meta })));
}

export async function encryptBackup(plaintext: string, passphrase: string, meta: { appVersion: string; exportedAt: string }, iterations = PBKDF2_ITERATIONS): Promise<EncryptedBackupFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = {
    format: "smloyalty-backup-encrypted" as const, formatVersion: 1 as const,
    kdf: { name: "PBKDF2-SHA256" as const, iterations, salt: base64urlEncode(salt) },
    cipher: { name: "AES-256-GCM" as const, iv: base64urlEncode(iv) }, meta,
  };
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bytes(iv), additionalData: aad(header) }, key, bytes(enc.encode(plaintext)));
  return { ...header, ciphertext: base64urlEncode(new Uint8Array(ct)) };
}

/** Throws "wrong_passphrase_or_corrupt" when authentication fails. */
export async function decryptBackup(file: EncryptedBackupFile, passphrase: string): Promise<string> {
  if (file.kdf?.name !== "PBKDF2-SHA256" || file.cipher?.name !== "AES-256-GCM") throw new Error("unsupported_cipher");
  if (!Number.isInteger(file.kdf.iterations) || file.kdf.iterations < 100_000 || file.kdf.iterations > 5_000_000) throw new Error("unsupported_cipher");
  try {
    const key = await deriveKey(passphrase, base64urlDecode(file.kdf.salt), file.kdf.iterations);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(base64urlDecode(file.cipher.iv)), additionalData: aad(file) }, key, bytes(base64urlDecode(file.ciphertext)));
    return new TextDecoder("utf-8", { fatal: true }).decode(pt);
  } catch {
    throw new Error("wrong_passphrase_or_corrupt");
  }
}
