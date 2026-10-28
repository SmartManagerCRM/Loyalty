import { ed25519 } from "@noble/curves/ed25519";
import { canonicalize } from "./canonical";
import { base64urlDecode, base64urlDecodeString, base64urlEncode, base64urlEncodeString, utf8ToBytes } from "./encoding";
import { isValidFingerprint } from "./fingerprint";
import {
  LICENSE_FORMAT, LicenseCheck, LicenseEnvelope, LicenseFailureCode, LicensePayload, PRODUCT_ID, SCHEMA_VERSION,
  SIGNING_DOMAIN, TrustedKey, ValidityResult,
} from "./types";

export const LICENSE_PREFIX = "SMLYLIC1:";
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const MAX_LICENSE_BYTES = 16 * 1024;

export function parseIso(s: string): number {
  if (!ISO_Z.test(s)) return NaN;
  return Date.parse(s);
}

export function signingBytes(payloadCanonical: string): Uint8Array {
  return utf8ToBytes(SIGNING_DOMAIN + payloadCanonical);
}

/** Compute the keyId for a public key (stable, short, human comparable). */
export function keyIdFor(publicKey: Uint8Array): string {
  // first 8 bytes of sha256 would need hashes import; use ed25519 pubkey directly (not secret): base64url prefix is unique enough
  return "k1-" + base64urlEncode(publicKey).slice(0, 10);
}

export function generateSigningKey(): { seed: Uint8Array; publicKey: Uint8Array; keyId: string } {
  const seed = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(seed);
  return { seed, publicKey, keyId: keyIdFor(publicKey) };
}

export function publicKeyFromSeed(seed: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(seed);
}

/** Validate payload shape. Returns an error message or null. */
export function validatePayloadShape(p: unknown): string | null {
  if (!p || typeof p !== "object" || Array.isArray(p)) return "payload is not an object";
  const o = p as Record<string, unknown>;
  const str = (k: string) => typeof o[k] === "string" && (o[k] as string).length > 0;
  for (const k of ["productId", "licenseId", "licenseType", "issuedAt", "validFrom", "keyId"]) if (!str(k)) return `missing ${k}`;
  if (o.schemaVersion !== SCHEMA_VERSION) return "unsupported schemaVersion";
  if (typeof o.customerReference !== "string") return "missing customerReference";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(o.licenseId as string)) return "licenseId is not a UUID";
  if (o.licenseType !== "lifetime" && o.licenseType !== "custom_duration") return "unknown licenseType";
  if (Number.isNaN(parseIso(o.issuedAt as string))) return "issuedAt invalid";
  if (Number.isNaN(parseIso(o.validFrom as string))) return "validFrom invalid";
  if (o.licenseType === "lifetime") {
    if (o.expiresAt !== null) return "lifetime license must have expiresAt null";
  } else {
    if (typeof o.expiresAt !== "string" || Number.isNaN(parseIso(o.expiresAt))) return "expiresAt invalid";
    if (parseIso(o.expiresAt) <= parseIso(o.validFrom as string)) return "expiresAt must be after validFrom";
  }
  const db = o.deviceBinding as Record<string, unknown> | undefined;
  if (!db || db.type !== "installation-fingerprint" || typeof db.value !== "string" || !isValidFingerprint(db.value)) return "deviceBinding invalid";
  if (!Array.isArray(o.features) || o.features.some((f) => typeof f !== "string" || !/^[a-z0-9_]{1,40}$/.test(f))) return "features invalid";
  if (o.metadata !== undefined) {
    const m = o.metadata as Record<string, unknown>;
    if (!m || typeof m !== "object" || Array.isArray(m) || Object.values(m).some((v) => typeof v !== "string" || v.length > 200)) return "metadata invalid";
  }
  return null;
}

/** Sign a payload with a 32-byte Ed25519 seed. Used by the generator (and tests). */
export function signLicense(payload: LicensePayload, seed: Uint8Array): LicenseEnvelope {
  const problem = validatePayloadShape(payload);
  if (problem) throw new Error(`Refusing to sign invalid payload: ${problem}`);
  const canonical = canonicalize(payload);
  const signature = ed25519.sign(signingBytes(canonical), seed);
  return {
    format: LICENSE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    keyId: payload.keyId,
    payload: canonical,
    signature: base64urlEncode(signature),
  };
}

export function serializeLicenseFile(env: LicenseEnvelope): string {
  return JSON.stringify(env, null, 2) + "\n";
}
export function licenseToCompact(env: LicenseEnvelope): string {
  return LICENSE_PREFIX + base64urlEncodeString(JSON.stringify(env));
}

function fail(code: LicenseFailureCode, message: string): LicenseCheck {
  return { ok: false, code, message };
}

export interface VerifyOptions {
  trustedKeys: TrustedKey[];
  /** Fingerprint of this device; when omitted the device check is skipped (generator side). */
  deviceFingerprint?: string;
}

/**
 * Verify a license file / pasted text completely offline: structure, schema,
 * key approval, Ed25519 signature, canonical form, product and device binding.
 * Validity dates are evaluated separately by {@link evaluateValidity}.
 */
export function verifyLicense(text: string, opts: VerifyOptions): LicenseCheck {
  let env: LicenseEnvelope;
  try {
    let raw = text.trim();
    if (raw.length === 0 || raw.length > MAX_LICENSE_BYTES * 2) return fail("malformed", "License file is empty or too large.");
    if (raw.startsWith(LICENSE_PREFIX)) raw = base64urlDecodeString(raw.slice(LICENSE_PREFIX.length).replace(/\s+/g, ""));
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("malformed", "License file is not valid.");
    env = parsed as LicenseEnvelope;
  } catch {
    return fail("malformed", "License file could not be read.");
  }
  if (env.format !== LICENSE_FORMAT) return fail("unknown_format", "This is not a SmartManager Loyalty license file.");
  if (env.schemaVersion !== SCHEMA_VERSION) return fail("unsupported_schema", "This license uses a newer format. Update the app.");
  if (typeof env.keyId !== "string" || typeof env.payload !== "string" || typeof env.signature !== "string") return fail("malformed", "License file is missing fields.");
  if (env.payload.length > MAX_LICENSE_BYTES) return fail("malformed", "License payload too large.");

  const key = opts.trustedKeys.find((k) => k.keyId === env.keyId);
  if (!key) return fail("unknown_key", "This license was signed with a key this app does not trust.");

  let sig: Uint8Array;
  let pub: Uint8Array;
  try {
    sig = base64urlDecode(env.signature);
    pub = base64urlDecode(key.publicKey);
  } catch {
    return fail("malformed", "License signature is not valid.");
  }
  if (sig.length !== 64 || pub.length !== 32) return fail("malformed", "License signature is not valid.");
  let sigOk = false;
  try {
    sigOk = ed25519.verify(sig, signingBytes(env.payload), pub);
  } catch {
    sigOk = false;
  }
  if (!sigOk) return fail("bad_signature", "License signature is invalid. The file was modified or is not genuine.");

  let payload: unknown;
  try {
    payload = JSON.parse(env.payload);
  } catch {
    return fail("malformed", "License payload could not be read.");
  }
  let canonical: string;
  try {
    canonical = canonicalize(payload);
  } catch {
    return fail("non_canonical", "License payload is not in canonical form.");
  }
  if (canonical !== env.payload) return fail("non_canonical", "License payload is not in canonical form.");

  const problem = validatePayloadShape(payload);
  if (problem) return fail(problem.startsWith("unsupported") ? "unsupported_schema" : "missing_field", `License is invalid: ${problem}.`);
  const p = payload as LicensePayload;
  if (p.keyId !== env.keyId) return fail("bad_signature", "License key identifiers do not match.");
  if (p.productId !== PRODUCT_ID) return fail("wrong_product", "This license is for a different SmartManager product.");

  const issued = parseIso(p.issuedAt);
  if ((key.notBefore && issued < Date.parse(key.notBefore)) || (key.notAfter && issued > Date.parse(key.notAfter))) {
    return fail("key_not_valid_for_issue_date", "The signing key was not approved at the time this license was issued.");
  }
  if (opts.deviceFingerprint !== undefined && p.deviceBinding.value !== opts.deviceFingerprint) {
    return fail("wrong_device", "This license was issued for a different device.");
  }
  return { ok: true, payload: p, envelope: env };
}

export const CLOCK_ROLLBACK_TOLERANCE_MS = 48 * 3600 * 1000;
const DAY_MS = 86_400_000;

/**
 * Evaluate validity dates. `lastSeenMs` is the highest trusted wall-clock time the
 * app has observed (null if none). Lifetime licenses ignore the clock entirely.
 * Validity is half-open: validFrom <= t < expiresAt.
 */
export function evaluateValidity(p: LicensePayload, nowMs: number, lastSeenMs: number | null): ValidityResult {
  if (p.expiresAt === null) {
    return { state: nowMs < parseIso(p.validFrom) && (lastSeenMs === null || lastSeenMs < parseIso(p.validFrom)) ? "not_yet_valid" : "active", daysRemaining: null };
  }
  const from = parseIso(p.validFrom);
  const exp = parseIso(p.expiresAt);
  if (lastSeenMs !== null && nowMs < lastSeenMs - CLOCK_ROLLBACK_TOLERANCE_MS) {
    // Clock moved back. Do not let it revive an expired license.
    return { state: lastSeenMs >= exp ? "expired" : "clock_anomaly", daysRemaining: Math.ceil((exp - lastSeenMs) / DAY_MS) };
  }
  const effective = Math.max(nowMs, lastSeenMs ?? nowMs);
  const daysRemaining = Math.ceil((exp - effective) / DAY_MS);
  if (effective >= exp) return { state: "expired", daysRemaining };
  if (nowMs < from) return { state: "not_yet_valid", daysRemaining };
  return { state: "active", daysRemaining };
}
