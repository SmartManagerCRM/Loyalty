import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as nodeSign, createPrivateKey } from "node:crypto";
import {
  base64urlDecode, base64urlEncode, canonicalize, createActivationRequest, activationRequestToCompact, parseActivationRequest,
  deriveFingerprint, evaluateValidity, generateSigningKey, licenseToCompact, serializeLicenseFile, signLicense, signingBytes,
  verifyLicense, TrustedKey, LicensePayload, PRODUCT_ID, CLOCK_ROLLBACK_TOLERANCE_MS,
} from "../src";

const key = generateSigningKey();
const trusted: TrustedKey[] = [{ keyId: key.keyId, publicKey: base64urlEncode(key.publicKey) }];
const fp = deriveFingerprint("install-id-0123456789abcdef");
const uuid = "3f2b8c1e-9d4a-4e57-8a31-0c2b7d6e5f40";

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    schemaVersion: 1, productId: PRODUCT_ID, licenseId: uuid, customerReference: "Salon Noor", licenseType: "lifetime",
    issuedAt: "2026-01-01T00:00:00Z", validFrom: "2026-01-01T00:00:00Z", expiresAt: null,
    deviceBinding: { type: "installation-fingerprint", value: fp }, features: ["core"], keyId: key.keyId, ...over,
  };
}
const issue = (p = payload()) => serializeLicenseFile(signLicense(p, key.seed));

describe("encoding / canonical", () => {
  it("roundtrips base64url for all lengths", () => {
    for (let n = 0; n < 40; n++) {
      const b = new Uint8Array(n).map((_, i) => (i * 37 + n) & 255);
      expect(Array.from(base64urlDecode(base64urlEncode(b)))).toEqual(Array.from(b));
    }
    expect(() => base64urlDecode("ab+/")).toThrow();
  });
  it("canonicalizes deterministically and rejects floats", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"b":1}');
    expect(() => canonicalize({ a: 1.5 })).toThrow();
    expect(() => canonicalize({ a: undefined })).toThrow();
  });
});

describe("fingerprint & activation request", () => {
  it("is stable, formatted and install-specific", () => {
    expect(fp).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){4}$/);
    expect(deriveFingerprint("install-id-0123456789abcdef")).toBe(fp);
    expect(deriveFingerprint("install-id-0123456789abcdeg")).not.toBe(fp);
  });
  it("round-trips file and compact forms and detects damage", () => {
    const req = createActivationRequest({ fingerprint: fp, requestId: uuid, createdAt: "2026-02-01T10:00:00Z", appVersion: "1.0.0", platform: "android", customerReference: "Salon Noor" });
    expect(parseActivationRequest(JSON.stringify(req))).toMatchObject({ ok: true });
    const compact = activationRequestToCompact(req);
    expect(parseActivationRequest(compact)).toMatchObject({ ok: true });
    expect(parseActivationRequest(JSON.stringify({ ...req, platform: "ios" })).ok).toBe(false);
    expect(parseActivationRequest(JSON.stringify({ ...req, productId: "smartmanager-installments" })).ok).toBe(false);
    expect(parseActivationRequest(compact.slice(0, -6)).ok).toBe(false);
    expect(parseActivationRequest("garbage").ok).toBe(false);
  });
});

describe("verifyLicense", () => {
  it("accepts a valid lifetime license for this device (file and compact form)", () => {
    const r = verifyLicense(issue(), { trustedKeys: trusted, deviceFingerprint: fp });
    expect(r.ok).toBe(true);
    const env = signLicense(payload(), key.seed);
    expect(verifyLicense(licenseToCompact(env), { trustedKeys: trusted, deviceFingerprint: fp }).ok).toBe(true);
  });
  it("accepts a valid custom-duration license", () => {
    const p = payload({ licenseType: "custom_duration", expiresAt: "2027-01-01T00:00:00Z" });
    expect(verifyLicense(issue(p), { trustedKeys: trusted, deviceFingerprint: fp }).ok).toBe(true);
  });
  it("rejects wrong device", () => {
    const r = verifyLicense(issue(), { trustedKeys: trusted, deviceFingerprint: deriveFingerprint("another-install-id-000000") });
    expect(r).toMatchObject({ ok: false, code: "wrong_device" });
  });
  it("rejects wrong product (validly signed)", () => {
    const p = payload({ productId: "smartmanager-installments" });
    // signLicense validates shape only; product mismatch is caught by verify
    expect(verifyLicense(issue(p), { trustedKeys: trusted, deviceFingerprint: fp })).toMatchObject({ ok: false, code: "wrong_product" });
  });
  it("rejects altered payload (e.g. extended expiry)", () => {
    const env = signLicense(payload({ licenseType: "custom_duration", expiresAt: "2026-03-01T00:00:00Z" }), key.seed);
    const tampered = { ...env, payload: env.payload.replace("2026-03-01", "2036-03-01") };
    expect(verifyLicense(JSON.stringify(tampered), { trustedKeys: trusted, deviceFingerprint: fp })).toMatchObject({ ok: false, code: "bad_signature" });
  });
  it("rejects lifetime tampering and device swap", () => {
    const env = signLicense(payload(), key.seed);
    const other = deriveFingerprint("attacker-device-id-000000");
    const tampered = { ...env, payload: env.payload.replace(fp, other) };
    expect(verifyLicense(JSON.stringify(tampered), { trustedKeys: trusted, deviceFingerprint: other })).toMatchObject({ ok: false, code: "bad_signature" });
  });
  it("rejects signature by an untrusted key", () => {
    const evil = generateSigningKey();
    const env = signLicense(payload({ keyId: evil.keyId }), evil.seed);
    expect(verifyLicense(JSON.stringify(env), { trustedKeys: trusted, deviceFingerprint: fp })).toMatchObject({ ok: false, code: "unknown_key" });
    // claiming the trusted keyId with the wrong key
    const forged = signLicense(payload(), evil.seed);
    expect(verifyLicense(JSON.stringify(forged), { trustedKeys: trusted, deviceFingerprint: fp })).toMatchObject({ ok: false, code: "bad_signature" });
  });
  it("rejects malformed, missing fields and unknown schema/format", () => {
    const opts = { trustedKeys: trusted, deviceFingerprint: fp };
    expect(verifyLicense("", opts)).toMatchObject({ ok: false, code: "malformed" });
    expect(verifyLicense("{not json", opts)).toMatchObject({ ok: false, code: "malformed" });
    expect(verifyLicense("[]", opts)).toMatchObject({ ok: false, code: "malformed" });
    const env = signLicense(payload(), key.seed);
    expect(verifyLicense(JSON.stringify({ ...env, format: "other" }), opts)).toMatchObject({ code: "unknown_format" });
    expect(verifyLicense(JSON.stringify({ ...env, schemaVersion: 2 }), opts)).toMatchObject({ code: "unsupported_schema" });
    expect(verifyLicense(JSON.stringify({ ...env, signature: undefined }), opts)).toMatchObject({ code: "malformed" });
    expect(verifyLicense(JSON.stringify({ ...env, signature: "AAAA" }), opts)).toMatchObject({ code: "malformed" });
    // validly signed but missing required field: bypass signLicense's shape check
    const bad = canonicalize({ ...payload(), features: undefined === 1 ? [] : "core" });
    const sig = base64urlEncode(signingBytesSign(bad));
    expect(verifyLicense(JSON.stringify({ format: "smloyalty-license", schemaVersion: 1, keyId: key.keyId, payload: bad, signature: sig }), opts)).toMatchObject({ ok: false, code: "missing_field" });
  });
  it("rejects non-canonical but validly signed payloads", () => {
    const pretty = JSON.stringify(payload(), null, 2);
    const sig = base64urlEncode(signingBytesSign(pretty));
    expect(verifyLicense(JSON.stringify({ format: "smloyalty-license", schemaVersion: 1, keyId: key.keyId, payload: pretty, signature: sig }), { trustedKeys: trusted, deviceFingerprint: fp }))
      .toMatchObject({ ok: false, code: "non_canonical" });
  });
  it("honours key issue windows (future key rotation)", () => {
    const keys: TrustedKey[] = [{ ...trusted[0]!, notAfter: "2025-12-31T00:00:00Z" }];
    expect(verifyLicense(issue(), { trustedKeys: keys, deviceFingerprint: fp })).toMatchObject({ code: "key_not_valid_for_issue_date" });
  });
  it("is interoperable with Node's native Ed25519 signer", () => {
    const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
    const priv = createPrivateKey({ key: Buffer.concat([pkcs8Prefix, Buffer.from(key.seed)]), format: "der", type: "pkcs8" });
    const canonical = canonicalize(payload());
    const sig = nodeSign(null, Buffer.from(signingBytes(canonical)), priv);
    const env = { format: "smloyalty-license", schemaVersion: 1, keyId: key.keyId, payload: canonical, signature: base64urlEncode(new Uint8Array(sig)) };
    expect(verifyLicense(JSON.stringify(env), { trustedKeys: trusted, deviceFingerprint: fp }).ok).toBe(true);
    void generateKeyPairSync;
  });
  it("refuses to sign invalid payloads", () => {
    expect(() => signLicense(payload({ licenseType: "lifetime", expiresAt: "2030-01-01T00:00:00Z" }), key.seed)).toThrow();
    expect(() => signLicense(payload({ licenseType: "custom_duration", expiresAt: null }), key.seed)).toThrow();
    expect(() => signLicense(payload({ licenseId: "nope" }), key.seed)).toThrow();
  });
});

import { ed25519 } from "@noble/curves/ed25519";
function signingBytesSign(canonical: string): Uint8Array {
  return ed25519.sign(signingBytes(canonical), key.seed);
}

describe("evaluateValidity", () => {
  const T = (s: string) => Date.parse(s);
  const custom = payload({ licenseType: "custom_duration", validFrom: "2026-03-01T00:00:00Z", expiresAt: "2026-04-01T00:00:00Z" });
  it("lifetime is always active regardless of clock", () => {
    expect(evaluateValidity(payload(), T("2099-01-01T00:00:00Z"), null).state).toBe("active");
    expect(evaluateValidity(payload(), T("2026-01-02T00:00:00Z"), T("2030-01-01T00:00:00Z")).state).toBe("active");
  });
  it("custom duration is valid only inside [validFrom, expiresAt)", () => {
    expect(evaluateValidity(custom, T("2026-02-28T23:59:59Z"), null).state).toBe("not_yet_valid");
    expect(evaluateValidity(custom, T("2026-03-01T00:00:00Z"), null).state).toBe("active");
    expect(evaluateValidity(custom, T("2026-03-31T23:59:59Z"), null).state).toBe("active");
    expect(evaluateValidity(custom, T("2026-04-01T00:00:00Z"), null).state).toBe("expired");
  });
  it("reports whole days remaining", () => {
    expect(evaluateValidity(custom, T("2026-03-02T00:00:00Z"), null).daysRemaining).toBe(30);
  });
  it("small clock jitter is tolerated; large rollback is flagged; expired stays expired", () => {
    const seen = T("2026-03-10T12:00:00Z");
    expect(evaluateValidity(custom, seen - 3600_000, seen).state).toBe("active");
    expect(evaluateValidity(custom, seen - CLOCK_ROLLBACK_TOLERANCE_MS - 1000, seen).state).toBe("clock_anomaly");
    expect(evaluateValidity(custom, T("2026-03-05T00:00:00Z"), T("2026-04-02T00:00:00Z")).state).toBe("expired");
  });
  it("is timezone independent (instants, not local dates)", () => {
    const before = process.env.TZ;
    for (const tz of ["Pacific/Kiritimati", "America/Los_Angeles", "UTC"]) {
      process.env.TZ = tz;
      expect(evaluateValidity(custom, Date.parse("2026-03-31T23:59:59.999Z"), null).state).toBe("active");
      expect(evaluateValidity(custom, Date.parse("2026-04-01T00:00:00.000Z"), null).state).toBe("expired");
    }
    process.env.TZ = before;
  });
});
