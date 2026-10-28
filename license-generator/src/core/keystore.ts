import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ed25519 } from "@noble/curves/ed25519";
import { base64urlDecode, base64urlEncode, generateSigningKey, keyIdFor, signingBytes, TrustedKey } from "@smloyalty/license-core";
import { GeneratorError } from "./types";

export const KEY_FILE = "signing-key.smlkey";
const FORMAT = "smloyalty-signing-key";
const SCRYPT = { N: 1 << 17, r: 8, p: 1, maxmem: 512 * 1024 * 1024 };
export const MIN_PASSPHRASE = 12;

interface KeyFile {
  format: typeof FORMAT;
  version: 1;
  keyId: string;
  publicKey: string;
  createdAt: string;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher: { name: "aes-256-gcm"; iv: string; tag: string };
  ciphertext: string;
}

export interface KeyStatus {
  exists: boolean;
  unlocked: boolean;
  keyId?: string;
  publicKey?: string;
  createdAt?: string;
}

function deriveKey(passphrase: string, salt: Buffer, N = SCRYPT.N, r = SCRYPT.r, p = SCRYPT.p): Buffer {
  return scryptSync(Buffer.from(passphrase.normalize("NFKC"), "utf8"), salt, 32, { N, r, p, maxmem: SCRYPT.maxmem });
}

const aadOf = (f: Pick<KeyFile, "format" | "version" | "keyId" | "publicKey" | "createdAt" | "kdf">) => Buffer.from(JSON.stringify({ format: f.format, version: f.version, keyId: f.keyId, publicKey: f.publicKey, createdAt: f.createdAt, kdf: f.kdf }));

export function passphraseProblem(p: string): string | null {
  if (p.length < MIN_PASSPHRASE) return "passphrase_short";
  if (new Set(p).size < 5) return "passphrase_weak";
  return null;
}

/**
 * The Ed25519 signing key lives only here, encrypted with a passphrase (scrypt + AES-256-GCM).
 * There is deliberately no API that returns the raw private key: it is decrypted into memory to sign and then discarded.
 * An existing key is never replaced silently.
 */
export class KeyStore {
  private seed: Uint8Array | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly dir: string, private readonly idleLockMs = 10 * 60_000) {}

  private get path() {
    return join(this.dir, KEY_FILE);
  }

  private read(): KeyFile | null {
    if (!existsSync(this.path)) return null;
    return JSON.parse(readFileSync(this.path, "utf8")) as KeyFile;
  }

  status(): KeyStatus {
    const f = this.read();
    return f ? { exists: true, unlocked: this.seed !== null, keyId: f.keyId, publicKey: f.publicKey, createdAt: f.createdAt } : { exists: false, unlocked: false };
  }

  private writeAtomic(path: string, text: string) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, text, { mode: 0o600 });
    renameSync(tmp, path);
    try { chmodSync(path, 0o600); } catch { /* not supported on this platform */ }
  }

  private encrypt(seed: Uint8Array, publicKey: Uint8Array, passphrase: string, createdAt: string): KeyFile {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const header = {
      format: FORMAT as typeof FORMAT, version: 1 as const, keyId: keyIdFor(publicKey), publicKey: base64urlEncode(publicKey), createdAt,
      kdf: { name: "scrypt" as const, N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: base64urlEncode(salt) },
    };
    const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
    cipher.setAAD(aadOf(header));
    const ct = Buffer.concat([cipher.update(Buffer.from(seed)), cipher.final()]);
    return { ...header, cipher: { name: "aes-256-gcm", iv: base64urlEncode(iv), tag: base64urlEncode(cipher.getAuthTag()) }, ciphertext: base64urlEncode(ct) };
  }

  private decrypt(f: KeyFile, passphrase: string): Uint8Array {
    if (f.format !== FORMAT || f.version !== 1 || f.kdf?.name !== "scrypt" || f.cipher?.name !== "aes-256-gcm") throw new GeneratorError("key_file_invalid");
    try {
      const d = createDecipheriv("aes-256-gcm", deriveKey(passphrase, Buffer.from(base64urlDecode(f.kdf.salt)), f.kdf.N, f.kdf.r, f.kdf.p), Buffer.from(base64urlDecode(f.cipher.iv)));
      d.setAAD(aadOf(f));
      d.setAuthTag(Buffer.from(base64urlDecode(f.cipher.tag)));
      const seed = new Uint8Array(Buffer.concat([d.update(Buffer.from(base64urlDecode(f.ciphertext))), d.final()]));
      if (seed.length !== 32 || base64urlEncode(ed25519.getPublicKey(seed)) !== f.publicKey) throw new Error("mismatch");
      return seed;
    } catch {
      throw new GeneratorError("wrong_passphrase");
    }
  }

  /** First-time key creation. Refuses when a key already exists (a replacement would invalidate every issued license). */
  create(passphrase: string): KeyStatus {
    if (this.read()) throw new GeneratorError("key_exists");
    const problem = passphraseProblem(passphrase);
    if (problem) throw new GeneratorError(problem);
    const k = generateSigningKey();
    const file = this.encrypt(k.seed, k.publicKey, passphrase, new Date().toISOString());
    this.writeAtomic(this.path, JSON.stringify(file, null, 2));
    this.seed = k.seed;
    this.touch();
    return this.status();
  }

  unlock(passphrase: string): KeyStatus {
    const f = this.read();
    if (!f) throw new GeneratorError("no_key");
    this.seed = this.decrypt(f, passphrase);
    this.touch();
    return this.status();
  }

  lock() {
    this.seed?.fill(0);
    this.seed = null;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.lock(), this.idleLockMs);
    this.idleTimer.unref?.();
  }

  /** Sign canonical payload bytes (domain-separated). */
  signCanonical(canonicalPayload: string): Uint8Array {
    if (!this.seed) throw new GeneratorError("locked");
    this.touch();
    return ed25519.sign(signingBytes(canonicalPayload), this.seed);
  }

  /** Ed25519 seed for license-core's signLicense (kept internal to the main process; never exposed over IPC). */
  withSeed<T>(fn: (seed: Uint8Array) => T): T {
    if (!this.seed) throw new GeneratorError("locked");
    this.touch();
    return fn(this.seed);
  }

  trustedKey(): TrustedKey {
    const f = this.read();
    if (!f) throw new GeneratorError("no_key");
    return { keyId: f.keyId, publicKey: f.publicKey };
  }

  /** JSON to place into the app's trusted-keys.json (public key only). */
  publicKeyFileText(): string {
    const k = this.trustedKey();
    return JSON.stringify([{ ...k, note: `SmartManager Loyalty license verification key (created ${this.status().createdAt})` }], null, 2) + "\n";
  }

  /** Encrypted copy of the key file (still protected by the passphrase). Not a raw private key export. */
  encryptedBackupText(): string {
    const f = this.read();
    if (!f) throw new GeneratorError("no_key");
    return JSON.stringify(f, null, 2) + "\n";
  }

  /** Recover the key on a new machine. Refuses when a key already exists. Verifies the passphrase before installing. */
  restoreFromBackup(text: string, passphrase: string): KeyStatus {
    if (this.read()) throw new GeneratorError("key_exists");
    let f: KeyFile;
    try { f = JSON.parse(text) as KeyFile; } catch { throw new GeneratorError("key_file_invalid"); }
    this.seed = this.decrypt(f, passphrase);
    this.writeAtomic(this.path, JSON.stringify(f, null, 2));
    this.touch();
    return this.status();
  }
}
