import { describe, expect, it } from "vitest";
import { createActivationRequest, activationRequestToCompact, deriveFingerprint, evaluateValidity, verifyLicense } from "@smloyalty/license-core";
import { createKey, issue, IssueError, makeRegister, parseInput, publicKeyFileText, statusOf, toCsv, unlockKey, verifyText, zonedToUtc, readKeyFile } from "../src/core";

const PASS = "correct horse battery";
const fp = deriveFingerprint("manager-test-device-0000001");
const fp2 = deriveFingerprint("manager-test-device-0000002");
const request = (f = fp) => activationRequestToCompact(createActivationRequest({ fingerprint: f, requestId: crypto.randomUUID(), createdAt: "2026-03-01T09:00:00Z", appVersion: "1.0.0", platform: "android", customerReference: "Hint Salon" }));
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const NOW = Date.parse("2026-03-10T08:30:00Z");

async function setup() {
  const k = await createKey(PASS, 100_000);
  const signer = await unlockKey(k.file, PASS);
  return { k, signer, trusted: JSON.parse(publicKeyFileText(k)) };
}

describe("keys", () => {
  it("encrypts the key, unlocks only with the passphrase, detects tampering, exports only the public key", async () => {
    const { k, trusted } = await setup();
    expect(k.file).not.toMatch(/"seed"|PRIVATE/);
    await expect(unlockKey(k.file, "wrong passphrase!!")).rejects.toThrow(/Wrong passphrase/);
    const f = readKeyFile(k.file); f.createdAt = "2000-01-01T00:00:00.000Z";
    await expect(unlockKey(JSON.stringify(f), PASS)).rejects.toThrow(/Wrong passphrase/);
    await expect(createKey("short")).rejects.toThrow(IssueError);
    expect(Object.keys(trusted[0]).sort()).toEqual(["keyId", "note", "publicKey"]);
    expect(() => readKeyFile("{}")).toThrow(/not a SmartManager/);
  });
});

describe("input", () => {
  it("accepts request code, request JSON or a bare device id (any formatting)", () => {
    expect(parseInput(request()).fingerprint).toBe(fp);
    expect(parseInput(request()).hint).toBe("Hint Salon");
    expect(parseInput(fp.toLowerCase().replace(/-/g, " ")).fingerprint).toBe(fp);
    expect(() => parseInput("hello")).toThrow(/not a valid/);
    expect(() => parseInput("  ")).toThrow(/Paste/);
  });
});

describe("issue", () => {
  it("lifetime license verifies in the app's verifier for that device only", async () => {
    const { signer, trusted } = await setup();
    const { record } = issue({ signer, deviceInput: request(), customer: "Salon Noor", orderRef: "INV-1", type: "lifetime", tz: "Asia/Riyadh", now: NOW });
    const ok = verifyLicense(record.licenseText, { trustedKeys: trusted, deviceFingerprint: fp });
    expect(ok.ok && ok.payload.expiresAt).toBeNull();
    expect(ok.ok && ok.payload.metadata?.orderRef).toBe("INV-1");
    expect(verifyLicense(record.licenseText, { trustedKeys: trusted, deviceFingerprint: fp2 })).toMatchObject({ ok: false, code: "wrong_device" });
    expect(verifyLicense(record.code, { trustedKeys: trusted, deviceFingerprint: fp }).ok).toBe(true);
  });
  it("subscription: starts 00:00 today and ends at the end of the last day in the chosen zone", async () => {
    const { signer, trusted } = await setup();
    const { record } = issue({ signer, deviceInput: fp, customer: "Gym", type: "duration", days: 30, tz: "Asia/Riyadh", now: NOW }); // 2026-03-10 11:30 Riyadh
    const p = (verifyLicense(record.licenseText, { trustedKeys: trusted }) as { ok: true; payload: Parameters<typeof evaluateValidity>[0] }).payload;
    expect(p.validFrom).toBe("2026-03-09T21:00:00Z"); // 00:00 on Mar 10 in UTC+3
    expect(p.expiresAt).toBe("2026-04-08T21:00:00Z"); // end of Apr 8 (day 30 counting today)
    const last = Date.parse("2026-04-08T20:59:59Z"), after = Date.parse("2026-04-08T21:00:00Z");
    expect(evaluateValidity(p, last, null).state).toBe("active");
    expect(evaluateValidity(p, after, null).state).toBe("expired");
    expect(statusOf(record, last)).toBe("ACTIVE"); expect(statusOf(record, after)).toBe("EXPIRED");
  });
  it("handles DST zones and far-east/west zones", () => {
    expect(new Date(zonedToUtc(2026, 3, 8, 23, 59, 59, "America/Los_Angeles")).toISOString()).toBe("2026-03-09T06:59:59.000Z"); // PDT after the 8 Mar switch
    expect(new Date(zonedToUtc(2026, 3, 1, 0, 0, 0, "Pacific/Kiritimati")).toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });
  it("validates inputs", async () => {
    const { signer } = await setup();
    const base = { signer, deviceInput: fp, customer: "X", now: NOW };
    expect(() => issue({ ...base, customer: " ", type: "lifetime" })).toThrow(/customer name/);
    expect(() => issue({ ...base, type: "duration", days: 0 })).toThrow(/Days/);
    expect(() => issue({ ...base, type: "duration", days: 5000 })).toThrow(/Days/);
    expect(() => issue({ ...base, type: "lifetime", tz: "Mars/Base" })).toThrow(/time zone/);
    expect(() => issue({ ...base, type: "lifetime", deviceInput: "nope" })).toThrow(/not a valid/);
  });
});

describe("register, renewal, replacement", () => {
  it("tracks revisions, supersedes old records, searches, exports CSV, backs up and restores", async () => {
    const { signer } = await setup();
    const reg = makeRegister(mem());
    const a = issue({ signer, deviceInput: fp, customer: "Alpha", orderRef: "A1", type: "duration", days: 30, tz: "UTC", now: NOW }).record;
    reg.add(a);
    expect(reg.activeForDevice(fp)?.licenseId).toBe(a.licenseId);
    const renewed = issue({ signer, deviceInput: fp, customer: "Alpha", type: "lifetime", tz: "UTC", now: NOW + 86_400_000, replaces: a, reason: "renewal" }).record;
    reg.add(renewed);
    expect(renewed.revision).toBe(2);
    expect(reg.latest()).toHaveLength(1);
    expect(reg.history(a.chainId).map((r) => r.status)).toEqual(["superseded", "active"]);
    const moved = issue({ signer, deviceInput: fp2, customer: "Alpha", type: "lifetime", tz: "UTC", now: NOW, replaces: renewed, reason: "phone lost" }).record;
    reg.add(moved);
    expect(reg.activeForDevice(fp)).toBeUndefined();
    expect(reg.search("alpha")).toHaveLength(1);
    expect(reg.search("zzz")).toHaveLength(0);
    expect(toCsv(reg.latest(), NOW)).toContain("Alpha");
    const copy = makeRegister(mem());
    expect(copy.importText(reg.exportText())).toEqual({ added: 3, skipped: 0 });
    expect(copy.importText(reg.exportText())).toEqual({ added: 0, skipped: 3 });
    expect(() => copy.importText("{}")).toThrow(/Not a register/);
    expect(() => reg.add(a)).toThrow(/Duplicate/);
  });
});

describe("verify tab logic", () => {
  it("reports valid, wrong device, tampered and expired licenses", async () => {
    const { signer, trusted } = await setup();
    const pub = JSON.stringify(trusted);
    const { record } = issue({ signer, deviceInput: fp, customer: "Cafe", type: "duration", days: 1, tz: "UTC", now: NOW });
    expect(verifyText(record.licenseText, pub, fp, NOW).ok).toBe(true);
    expect(verifyText(record.licenseText, pub, fp2, NOW).lines[0]).toMatch(/wrong_device/);
    expect(verifyText(record.licenseText.replace("Cafe", "Hack"), pub, fp, NOW).lines[0]).toMatch(/bad_signature/);
    expect(verifyText(record.licenseText, pub, fp, NOW + 3 * 86_400_000).lines.join()).toMatch(/EXPIRED/);
  });
});
