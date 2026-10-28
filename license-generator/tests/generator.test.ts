import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createActivationRequest, activationRequestToCompact, deriveFingerprint, evaluateValidity, parseActivationRequest, serializeActivationRequest, verifyLicense, TrustedKey, LicensePayload,
} from "@smloyalty/license-core";
import { KeyStore, KEY_FILE } from "../src/core/keystore";
import { HistoryStore } from "../src/core/history";
import { Issuer, addMonthsLocal } from "../src/core/issuer";

const PASS = "correct horse battery staple";
let dir: string;
let now = Date.parse("2026-03-01T10:00:00Z");

const fpA = deriveFingerprint("device-A-installation-id-0001");
const fpB = deriveFingerprint("device-B-installation-id-0002");
const request = (fp: string, platform = "android") =>
  serializeActivationRequest(createActivationRequest({ fingerprint: fp, requestId: crypto.randomUUID(), createdAt: "2026-03-01T09:00:00Z", appVersion: "1.0.0", platform }));

function setup() {
  const keys = new KeyStore(dir);
  keys.create(PASS);
  const history = new HistoryStore(dir);
  const issuer = new Issuer(keys, history, () => now);
  const trusted = (): TrustedKey[] => [keys.trustedKey()];
  return { keys, history, issuer, trusted };
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "smlgen-")); now = Date.parse("2026-03-01T10:00:00Z"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("signing key", () => {
  it("creates an encrypted key, never stores the raw seed, and refuses to replace it", () => {
    const keys = new KeyStore(dir);
    expect(keys.status().exists).toBe(false);
    keys.create(PASS);
    const raw = readFileSync(join(dir, KEY_FILE), "utf8");
    expect(raw).toContain("aes-256-gcm");
    expect(raw).not.toMatch(/PRIVATE|seed/i);
    expect(() => keys.create(PASS)).toThrow(/key_exists/);
    expect(() => new KeyStore(dir).create("another long passphrase!")).toThrow(/key_exists/);
  });
  it("rejects weak passphrases", () => {
    expect(() => new KeyStore(dir).create("short")).toThrow(/passphrase_short/);
    expect(() => new KeyStore(dir).create("aaaaaaaaaaaaaaaa")).toThrow(/passphrase_weak/);
  });
  it("locks, unlocks with the right passphrase only, and cannot sign while locked", () => {
    const keys = new KeyStore(dir);
    keys.create(PASS);
    keys.lock();
    expect(keys.status().unlocked).toBe(false);
    expect(() => keys.signCanonical("{}")).toThrow(/locked/);
    expect(() => keys.unlock("wrong passphrase here")).toThrow(/wrong_passphrase/);
    expect(keys.unlock(PASS).unlocked).toBe(true);
  });
  it("detects tampering with the key file header (AAD)", () => {
    const keys = new KeyStore(dir);
    keys.create(PASS);
    const p = join(dir, KEY_FILE);
    const f = JSON.parse(readFileSync(p, "utf8"));
    f.createdAt = "2000-01-01T00:00:00.000Z";
    writeFileSync(p, JSON.stringify(f));
    expect(() => new KeyStore(dir).unlock(PASS)).toThrow(/wrong_passphrase/);
  });
  it("exports only the public key and an encrypted backup that restores the same key on a new machine", () => {
    const { keys, issuer } = setup();
    const pub = JSON.parse(keys.publicKeyFileText());
    expect(Object.keys(pub[0]).sort()).toEqual(["keyId", "note", "publicKey"]);
    const backup = keys.encryptedBackupText();
    const dir2 = mkdtempSync(join(tmpdir(), "smlgen2-"));
    try {
      const k2 = new KeyStore(dir2);
      expect(() => k2.restoreFromBackup(backup, "wrong wrong wrong")).toThrow(/wrong_passphrase/);
      expect(existsSync(join(dir2, KEY_FILE))).toBe(false);
      k2.restoreFromBackup(backup, PASS);
      expect(k2.trustedKey()).toEqual(keys.trustedKey());
      // a license issued on the new machine is accepted by installs that trust the original public key
      const res = new Issuer(k2, new HistoryStore(dir2), () => now).issue({ requestText: request(fpA), customerReference: "X", licenseType: "lifetime" });
      expect(verifyLicense(res.fileText, { trustedKeys: [keys.trustedKey()], deviceFingerprint: fpA }).ok).toBe(true);
      expect(() => k2.restoreFromBackup(backup, PASS)).toThrow(/key_exists/);
    } finally { rmSync(dir2, { recursive: true, force: true }); }
    void issuer;
  });
});

describe("issuing licenses", () => {
  it("issues a lifetime license that the app-side verifier accepts only for that device", () => {
    const { issuer, trusted, history } = setup();
    const res = issuer.issue({ requestText: request(fpA), customerReference: "Salon Noor", notes: "paid cash", licenseType: "lifetime" });
    expect(res.fileName).toMatch(/\.smloyaltylicense$/);
    expect(res.summary.join("\n")).toContain("Lifetime");
    const ok = verifyLicense(res.fileText, { trustedKeys: trusted(), deviceFingerprint: fpA });
    expect(ok.ok && ok.payload.expiresAt).toBeNull();
    expect(verifyLicense(res.fileText, { trustedKeys: trusted(), deviceFingerprint: fpB })).toMatchObject({ ok: false, code: "wrong_device" });
    expect(verifyLicense(res.compactText, { trustedKeys: trusted(), deviceFingerprint: fpA }).ok).toBe(true);
    expect(history.all()).toHaveLength(1);
    expect(history.get(res.record.licenseId)?.notes).toBe("paid cash");
  });
  it("issues custom-duration licenses by months or by end date", () => {
    const { issuer, trusted } = setup();
    const a = issuer.issue({ requestText: request(fpA), customerReference: "A", licenseType: "custom_duration", durationMonths: 12 });
    const pa = (verifyLicense(a.fileText, { trustedKeys: trusted() }) as { ok: true; payload: { expiresAt: string; validFrom: string } }).payload;
    expect(evaluateValidity(pa as unknown as LicensePayload, now, null).state).toBe("active");
    expect(Date.parse(pa.expiresAt)).toBeGreaterThan(now + 360 * 86_400_000);
    const b = issuer.issue({ requestText: request(fpB), customerReference: "B", licenseType: "custom_duration", expiresOn: "2026-04-15" });
    const pb = (verifyLicense(b.fileText, { trustedKeys: trusted() }) as { ok: true; payload: { expiresAt: string } }).payload;
    // end of the chosen local day
    const end = new Date(2026, 3, 15, 23, 59, 59).getTime();
    expect(Date.parse(pb.expiresAt)).toBe(end);
  });
  it("validates options", () => {
    const { issuer } = setup();
    const base = { requestText: request(fpA), customerReference: "A" };
    expect(() => issuer.issue({ ...base, licenseType: "custom_duration" })).toThrow(/duration_required/);
    expect(() => issuer.issue({ ...base, licenseType: "custom_duration", expiresOn: "2026-02-01" })).toThrow(/expiry_in_past/);
    expect(() => issuer.issue({ ...base, licenseType: "custom_duration", durationMonths: 0 })).toThrow(/duration_required/);
    expect(() => issuer.issue({ ...base, licenseType: "lifetime", durationMonths: 12 })).toThrow(/lifetime_has_no_expiry/);
    expect(() => issuer.issue({ ...base, customerReference: "  ", licenseType: "lifetime" })).toThrow(/reference_required/);
    expect(() => issuer.issue({ ...base, requestText: "nonsense", licenseType: "lifetime" })).toThrow(/request_invalid/);
    expect(() => issuer.issue({ ...base, features: ["Bad Feature"], licenseType: "lifetime" })).toThrow(/features_invalid/);
    expect(() => issuer.issue({ ...base, expiresOn: "2026-13-40", licenseType: "custom_duration" })).toThrow(/date_invalid/);
  });
  it("accepts the compact request text and rejects requests for another product or edited requests", () => {
    const { issuer } = setup();
    const req = createActivationRequest({ fingerprint: fpA, requestId: crypto.randomUUID(), createdAt: "2026-03-01T09:00:00Z", appVersion: "1.0.0", platform: "ios" });
    expect(issuer.issue({ requestText: activationRequestToCompact(req), customerReference: "A", licenseType: "lifetime" }).record.requestPlatform).toBe("ios");
    const { issuer: i2 } = (() => { const d = mkdtempSync(join(tmpdir(), "smlgen3-")); const k = new KeyStore(d); k.create(PASS); return { issuer: new Issuer(k, new HistoryStore(d), () => now) }; })();
    expect(() => i2.issue({ requestText: JSON.stringify({ ...JSON.parse(serializeActivationRequest(req)), productId: "smartmanager-installments" }), customerReference: "A", licenseType: "lifetime" })).toThrow(/request_invalid/);
    expect(parseActivationRequest(JSON.stringify({ ...req, platform: "x" })).ok).toBe(false);
  });
  it("refuses to sign while the key is locked", () => {
    const { keys, issuer } = setup();
    keys.lock();
    expect(() => issuer.issue({ requestText: request(fpA), customerReference: "A", licenseType: "lifetime" })).toThrow(/locked/);
  });
  it("blocks a second active license for the same device and supports renewal", () => {
    const { issuer, history } = setup();
    const first = issuer.issue({ requestText: request(fpA), customerReference: "A", licenseType: "custom_duration", durationMonths: 1 });
    expect(() => issuer.issue({ requestText: request(fpA), customerReference: "A", licenseType: "lifetime" })).toThrow(/device_already_licensed/);
    now += 20 * 86_400_000;
    const renewed = issuer.renew({ requestText: request(fpA), customerReference: "A", licenseType: "custom_duration", durationMonths: 12, renewsLicenseId: first.record.licenseId });
    expect(history.get(first.record.licenseId)?.status).toBe("superseded");
    expect(history.get(renewed.record.licenseId)?.replaces).toBe(first.record.licenseId);
    expect(() => issuer.renew({ requestText: request(fpB), customerReference: "A", licenseType: "lifetime", renewsLicenseId: renewed.record.licenseId })).toThrow(/device_differs/);
  });
  it("device replacement requires a reason, confirmation and a different device; never silent", () => {
    const { issuer, history, trusted } = setup();
    const first = issuer.issue({ requestText: request(fpA), customerReference: "A", licenseType: "lifetime" });
    const base = { requestText: request(fpB), customerReference: "A", licenseType: "lifetime" as const, replacesLicenseId: first.record.licenseId };
    expect(() => issuer.reissue({ ...base, reason: "Phone lost", confirmed: false })).toThrow(/confirmation_required/);
    expect(() => issuer.reissue({ ...base, reason: "x", confirmed: true })).toThrow(/reason_required/);
    expect(() => issuer.reissue({ ...base, requestText: request(fpA), reason: "Phone lost", confirmed: true })).toThrow(/same_device_use_renew/);
    const res = issuer.reissue({ ...base, reason: "Phone lost", confirmed: true });
    expect(history.get(first.record.licenseId)).toMatchObject({ status: "superseded", supersededBy: res.record.licenseId, reissueReason: "Phone lost" });
    expect(verifyLicense(res.fileText, { trustedKeys: trusted(), deviceFingerprint: fpB }).ok).toBe(true);
    const p = verifyLicense(res.fileText, { trustedKeys: trusted() });
    expect(p.ok && p.payload.metadata?.replaces).toBe(first.record.licenseId);
  });
});

describe("history", () => {
  it("lists, searches, filters and summarises with derived states", () => {
    const { issuer, history } = setup();
    issuer.issue({ requestText: request(deriveFingerprint("dev-1-aaaaaaaaaaaaaaaa")), customerReference: "Alpha Salon", licenseType: "lifetime" });
    issuer.issue({ requestText: request(deriveFingerprint("dev-2-aaaaaaaaaaaaaaaa")), customerReference: "Beta Gym", notes: "VIP", licenseType: "custom_duration", expiresOn: "2026-03-20" });
    issuer.issue({ requestText: request(deriveFingerprint("dev-3-aaaaaaaaaaaaaaaa")), customerReference: "Gamma Cafe", licenseType: "custom_duration", durationMonths: 12 });
    expect(history.list({ query: "beta" }, now)).toHaveLength(1);
    expect(history.list({ query: "vip" }, now)).toHaveLength(1);
    expect(history.list({ type: "lifetime" }, now)).toHaveLength(1);
    expect(history.list({ state: "expiring" }, now).map((r) => r.customerReference)).toEqual(["Beta Gym"]);
    const s = history.summary(now);
    expect(s).toMatchObject({ total: 3, activeLifetime: 1, activeCustom: 2, expiring: 1, expired: 0 });
    const later = now + 60 * 86_400_000;
    expect(history.list({ state: "expired" }, later).map((r) => r.customerReference)).toEqual(["Beta Gym"]);
  });
  it("backs up and restores history with checksum, merges without overwriting, and detects tampering", async () => {
    const { issuer, history } = setup();
    issuer.issue({ requestText: request(fpA), customerReference: "Alpha", licenseType: "lifetime" });
    issuer.issue({ requestText: request(fpB), customerReference: "Beta", licenseType: "custom_duration", durationMonths: 6 });
    const backup = history.exportBackupText();
    const dir2 = mkdtempSync(join(tmpdir(), "smlgen4-"));
    try {
      const h2 = new HistoryStore(dir2);
      expect(h2.previewImport(backup).added).toHaveLength(2);
      expect(h2.importBackup(backup)).toEqual({ added: 2, identical: 0, conflicts: [] });
      expect(h2.importBackup(backup)).toEqual({ added: 0, identical: 2, conflicts: [] });
      expect(h2.all().map((r) => r.customerReference).sort()).toEqual(["Alpha", "Beta"]);
      const tampered = backup.replace("Alpha", "Mallory");
      expect(() => h2.importBackup(tampered)).toThrow(/backup_checksum/);
      expect(() => h2.importBackup("{}")).toThrow(/backup_invalid/);
      // conflicting record with the same id is reported, not overwritten
      const parsed = JSON.parse(backup);
      parsed.records[0].fileText += " ";
      const { createHash } = await import("node:crypto");
      const { canonicalize } = await import("@smloyalty/license-core");
      parsed.checksum = createHash("sha256").update(canonicalize({ exportedAt: parsed.exportedAt, count: parsed.count, records: parsed.records })).digest("hex");
      expect(h2.importBackup(JSON.stringify(parsed)).conflicts).toHaveLength(1);
      expect(h2.all().find((r) => r.customerReference === "Alpha")!.fileText.endsWith(" ")).toBe(false);
    } finally { rmSync(dir2, { recursive: true, force: true }); }
  });
  it("keeps a .bak copy and writes atomically", () => {
    const { issuer } = setup();
    issuer.issue({ requestText: request(fpA), customerReference: "Alpha", licenseType: "lifetime" });
    issuer.issue({ requestText: request(fpB), customerReference: "Beta", licenseType: "lifetime" });
    expect(existsSync(join(dir, "license-history.json.bak"))).toBe(true);
    expect(existsSync(join(dir, "license-history.json.tmp"))).toBe(false);
  });
});

describe("misc", () => {
  it("adds months with end-of-month clamping", () => {
    expect(addMonthsLocal(new Date(2026, 0, 31, 12), 1).getDate()).toBe(28);
    expect(addMonthsLocal(new Date(2026, 0, 15, 12), 12).getFullYear()).toBe(2027);
  });
});
