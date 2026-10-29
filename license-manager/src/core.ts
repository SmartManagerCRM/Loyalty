/**
 * Core logic of the SmartManager Loyalty License Manager (one offline HTML page).
 * Runs in the browser (bundled into index.html) and in Node (tests). Ed25519 signatures via license-core.
 */
import {
  base64urlDecode, base64urlEncode, bytesToHex, evaluateValidity, generateSigningKey, isValidFingerprint, keyIdFor, licenseToCompact, LicensePayload,
  normalizeFingerprint, parseActivationRequest, parseIso, PRODUCT_ID, SCHEMA_VERSION, serializeLicenseFile, signLicense, TrustedKey, verifyLicense,
  publicKeyFromSeed, utf8ToBytes,
} from "@smloyalty/license-core";
import { sha256 } from "@noble/hashes/sha256";

export class IssueError extends Error {}

const enc = new TextEncoder();
const ab = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const PBKDF2_ITER = 600_000;
export const MIN_PASS = 10;

// ───────────── input: request code or bare device id ─────────────
export function parseInput(text: string): { fingerprint: string; hint?: string; requestId?: string; platform?: string } {
  const t = text.trim();
  if (!t) throw new IssueError("Paste the request code or the Device ID first.");
  const r = parseActivationRequest(t);
  if (r.ok) return { fingerprint: r.request.deviceBinding.value, hint: r.request.customerReference, requestId: r.request.requestId, platform: r.request.platform };
  const fp = normalizeFingerprint(t);
  if (isValidFingerprint(fp)) return { fingerprint: fp };
  throw new IssueError("That is not a valid request code or Device ID. Ask the customer to copy it again from the app's activation screen.");
}

// ───────────── time zones ─────────────
export function localTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}
function tzOffsetMs(utcMs: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(utcMs)).reduce<Record<string, number>>((a, x) => { if (x.type !== "literal") a[x.type] = Number(x.value); return a; }, {});
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - utcMs;
}
/** UTC instant of a wall-clock time in an IANA zone (DST-safe, two-pass). */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, ss: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t;
}
export function ymdInZone(ms: number, tz: string): [number, number, number] {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)).split("-").map(Number);
  return [p[0]!, p[1]!, p[2]!];
}
export function validateZone(tz: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { throw new IssueError(`Unknown time zone "${tz}". Use an IANA name such as Asia/Riyadh.`); }
}

// ───────────── signing key (encrypted with a passphrase) ─────────────
export interface KeyFile { format: "smloyalty-signing-key"; version: 1; keyId: string; publicKey: string; createdAt: string; kdf: { name: "PBKDF2-SHA256"; iterations: number; salt: string }; cipher: { name: "AES-256-GCM"; iv: string }; ciphertext: string }
export interface Signer { seed: Uint8Array; keyId: string; publicKey: string }

async function deriveKey(pass: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: ab(salt), iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const aadOf = (f: Omit<KeyFile, "cipher" | "ciphertext">) => ab(enc.encode(JSON.stringify({ format: f.format, version: f.version, keyId: f.keyId, publicKey: f.publicKey, createdAt: f.createdAt, kdf: f.kdf })));

export async function createKey(passphrase: string, iterations = PBKDF2_ITER, now = new Date()): Promise<{ file: string; keyId: string; publicKey: string }> {
  if (passphrase.length < MIN_PASS) throw new IssueError(`Use a passphrase of at least ${MIN_PASS} characters.`);
  const k = generateSigningKey();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const head = {
    format: "smloyalty-signing-key" as const, version: 1 as const, keyId: k.keyId, publicKey: base64urlEncode(k.publicKey), createdAt: now.toISOString(),
    kdf: { name: "PBKDF2-SHA256" as const, iterations, salt: base64urlEncode(salt) },
  };
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ab(iv), additionalData: aadOf(head) }, await deriveKey(passphrase, salt, iterations), ab(k.seed));
  const file: KeyFile = { ...head, cipher: { name: "AES-256-GCM", iv: base64urlEncode(iv) }, ciphertext: base64urlEncode(new Uint8Array(ct)) };
  return { file: JSON.stringify(file, null, 1), keyId: k.keyId, publicKey: head.publicKey };
}

export function readKeyFile(text: string): KeyFile {
  let f: KeyFile;
  try { f = JSON.parse(text); } catch { throw new IssueError("This is not a SmartManager Loyalty key backup (.smlkey)."); }
  if (f.format !== "smloyalty-signing-key" || f.version !== 1 || !f.kdf || !f.cipher || !f.ciphertext) throw new IssueError("This is not a SmartManager Loyalty key backup (.smlkey).");
  return f;
}

export async function unlockKey(text: string, passphrase: string): Promise<Signer> {
  const f = readKeyFile(text);
  if (!Number.isInteger(f.kdf.iterations) || f.kdf.iterations < 100_000 || f.kdf.iterations > 5_000_000) throw new IssueError("Unsupported key file.");
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ab(base64urlDecode(f.cipher.iv)), additionalData: aadOf(f) }, await deriveKey(passphrase, base64urlDecode(f.kdf.salt), f.kdf.iterations), ab(base64urlDecode(f.ciphertext)));
    const seed = new Uint8Array(pt);
    if (seed.length !== 32 || base64urlEncode(publicKeyFromSeed(seed)) !== f.publicKey) throw new Error("mismatch");
    return { seed, keyId: f.keyId, publicKey: f.publicKey };
  } catch { throw new IssueError("Wrong passphrase (or the key file was modified)."); }
}

/** Public key in the format the app expects (app/trusted-keys.json). */
export function publicKeyFileText(f: { keyId: string; publicKey: string }): string {
  return JSON.stringify([{ keyId: f.keyId, publicKey: f.publicKey, note: "SmartManager Loyalty license verification key" }], null, 2) + "\n";
}

// ───────────── issuing ─────────────
export interface Record_ {
  licenseId: string; chainId: string; revision: number; customer: string; orderRef: string; type: "lifetime" | "custom_duration"; days: number | null;
  issuedAt: string; validFrom: string; expiresAt: string | null; device: string; keyId: string; licenseText: string; code: string; fileName: string;
  tz: string; status: "active" | "superseded"; reason?: string; replaces?: string;
}
export interface IssueInput {
  signer: Signer; deviceInput: string; customer: string; orderRef?: string; type: "lifetime" | "duration"; days?: number; tz?: string; now?: number;
  /** renewal/replacement */ replaces?: Record_; reason?: string;
}

export function issue(i: IssueInput): { record: Record_; summary: string } {
  const now = i.now ?? Date.now();
  const tz = i.tz || localTimeZone();
  validateZone(tz);
  const customer = i.customer.trim();
  if (!customer) throw new IssueError("Enter the customer name (required).");
  const dev = parseInput(i.deviceInput);
  let expiresAt: string | null = null;
  const [y, m, d] = ymdInZone(now, tz);
  const validFromMs = zonedToUtc(y, m, d, 0, 0, 0, tz);
  if (i.type === "duration") {
    const days = i.days ?? 0;
    if (!Number.isInteger(days) || days < 1 || days > 3660) throw new IssueError("Days must be a whole number between 1 and 3660.");
    const end = new Date(Date.UTC(y, m - 1, d + days - 1)); // today counts as day 1
    expiresAt = new Date(zonedToUtc(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), 23, 59, 59, tz) + 1000).toISOString().replace(/\.\d{3}Z$/, "Z"); // exclusive end = start of next day
  }
  const licenseId = crypto.randomUUID();
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const payload: LicensePayload = {
    schemaVersion: SCHEMA_VERSION, productId: PRODUCT_ID, licenseId, customerReference: customer.slice(0, 120), licenseType: i.type === "lifetime" ? "lifetime" : "custom_duration",
    issuedAt: iso(now), validFrom: iso(validFromMs), expiresAt, deviceBinding: { type: "installation-fingerprint", value: dev.fingerprint }, features: ["core"], keyId: i.signer.keyId,
    metadata: { ...(dev.requestId ? { requestId: dev.requestId } : {}), ...(i.orderRef?.trim() ? { orderRef: i.orderRef.trim().slice(0, 60) } : {}), ...(i.replaces ? { replaces: i.replaces.licenseId } : {}) },
  };
  const env = signLicense(payload, i.signer.seed);
  const fileText = serializeLicenseFile(env);
  const check = verifyLicense(fileText, { trustedKeys: [{ keyId: i.signer.keyId, publicKey: i.signer.publicKey }], deviceFingerprint: dev.fingerprint });
  if (!check.ok) throw new IssueError("Self-check failed: " + check.message);
  const slug = customer.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "customer";
  const record: Record_ = {
    licenseId, chainId: i.replaces?.chainId ?? licenseId, revision: (i.replaces?.revision ?? 0) + 1, customer, orderRef: i.orderRef?.trim() ?? "", type: payload.licenseType,
    days: i.type === "duration" ? i.days! : null, issuedAt: payload.issuedAt, validFrom: payload.validFrom, expiresAt, device: dev.fingerprint, keyId: i.signer.keyId,
    licenseText: fileText, code: licenseToCompact(env), fileName: `${slug}-${i.type === "lifetime" ? "lifetime" : "until-" + (expiresAt ?? "").slice(0, 10)}.smloyaltylicense`, tz, status: "active",
    ...(i.reason ? { reason: i.reason } : {}), ...(i.replaces ? { replaces: i.replaces.licenseId } : {}),
  };
  return { record, summary: summarize(record) };
}

export function summarize(r: Record_): string {
  return [
    `License ID : ${r.licenseId}`, `Customer   : ${r.customer}${r.orderRef ? `  (order ${r.orderRef})` : ""}`, `Type       : ${r.type === "lifetime" ? "Lifetime (never expires)" : `Subscription (${r.days} days)`}`,
    `Valid from : ${r.validFrom}`, `Valid until: ${r.expiresAt ?? "no expiry"}  [${r.tz}]`, `Device ID  : ${r.device}`, `Revision   : ${r.revision}${r.reason ? `  (${r.reason})` : ""}`,
  ].join("\n");
}

export type Status = "ACTIVE" | "EXPIRED" | "NOT YET VALID";
export function statusOf(r: Record_, now = Date.now()): Status {
  if (Date.parse(r.validFrom) > now) return "NOT YET VALID";
  if (r.expiresAt && now >= Date.parse(r.expiresAt)) return "EXPIRED";
  return "ACTIVE";
}

// ───────────── register (localStorage-compatible store) ─────────────
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export function makeRegister(kv: KV, slot = "smloyalty_register_v1") {
  const load = (): Record_[] => { try { return JSON.parse(kv.getItem(slot) ?? "[]") as Record_[]; } catch { return []; } };
  const save = (a: Record_[]) => kv.setItem(slot, JSON.stringify(a));
  return {
    all: load,
    /** latest revision of each license chain */
    latest: () => { const m = new Map<string, Record_>(); for (const r of load()) { const c = m.get(r.chainId); if (!c || r.revision > c.revision) m.set(r.chainId, r); } return [...m.values()].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)); },
    add(r: Record_) { const a = load(); if (a.some((x) => x.licenseId === r.licenseId)) throw new IssueError("Duplicate license id."); if (r.replaces) for (const x of a) if (x.licenseId === r.replaces) x.status = "superseded"; a.push(r); save(a); },
    history: (chainId: string) => load().filter((r) => r.chainId === chainId).sort((a, b) => a.revision - b.revision),
    activeForDevice: (device: string) => load().find((r) => r.device === device && r.status === "active"),
    search(q: string) { const s = q.trim().toLowerCase(); return this.latest().filter((r) => !s || [r.customer, r.orderRef, r.licenseId, r.device].some((v) => v.toLowerCase().includes(s))); },
    exportText: () => JSON.stringify({ format: "smloyalty-register", version: 1, exportedAt: new Date().toISOString(), records: load() }, null, 1),
    importText(text: string): { added: number; skipped: number } {
      let o: { format?: string; records?: Record_[] };
      try { o = JSON.parse(text); } catch { throw new IssueError("Not a register backup."); }
      if (o.format !== "smloyalty-register" || !Array.isArray(o.records)) throw new IssueError("Not a register backup.");
      const a = load(); let added = 0; let skipped = 0;
      for (const r of o.records) { if (a.some((x) => x.licenseId === r.licenseId)) skipped++; else { a.push(r); added++; } }
      save(a); return { added, skipped };
    },
  };
}

export function toCsv(rows: Record_[], now = Date.now()): string {
  const q = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [["order_ref", "customer", "license_id", "status", "type", "valid_from", "valid_until", "revision", "device_id", "issued_at"],
    ...rows.map((r) => [r.orderRef, r.customer, r.licenseId, statusOf(r, now), r.type, r.validFrom, r.expiresAt ?? "", r.revision, r.device, r.issuedAt])].map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

// ───────────── verify ─────────────
export function verifyText(licenseText: string, publicKeyText: string, deviceId: string, now = Date.now()): { ok: boolean; lines: string[] } {
  let keys: TrustedKey[];
  try { const j = JSON.parse(publicKeyText) as TrustedKey | TrustedKey[]; keys = Array.isArray(j) ? j : [j]; } catch { return { ok: false, lines: ["Public key must be the trusted-keys.json content."] }; }
  const dev = deviceId.trim() ? normalizeFingerprint(deviceId) : undefined;
  const r = verifyLicense(licenseText, { trustedKeys: keys, deviceFingerprint: dev });
  if (!r.ok) return { ok: false, lines: [`REJECTED (${r.code}): ${r.message}`] };
  const v = evaluateValidity(r.payload, now, null);
  const lines = [`Signature OK, product OK${dev ? ", device OK" : " (device not checked)"}`, `Customer: ${r.payload.customerReference}`, `Type: ${r.payload.licenseType}`, `Valid from: ${r.payload.validFrom}`, `Valid until: ${r.payload.expiresAt ?? "no expiry"}`, `State now: ${v.state.toUpperCase()}`];
  return { ok: v.state === "active", lines };
}

export function sha256Hex(s: string): string { return bytesToHex(sha256(utf8ToBytes(s))); }
export { keyIdFor, parseIso };
