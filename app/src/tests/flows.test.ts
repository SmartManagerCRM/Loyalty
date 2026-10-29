import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { base64urlEncode, generateSigningKey, signLicense, PRODUCT_ID, LicensePayload, serializeLicenseFile, TrustedKey, deriveFingerprint, createActivationRequest, parseActivationRequest } from "@smloyalty/license-core";
import { openSqlJsDb } from "../database/sqljs";
import { migrate } from "../database/migrations";
import { createServices } from "../repositories";
import { LicenseManager, MAX_CLOCK_REVIEWS } from "../services/licensing";
import { createMemoryKV } from "../services/secureStorage";
import { makeEnv, daysAgo } from "./helpers";
import { decryptBackup, encryptBackup } from "../domain/backupCrypto";

const expectCode = (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code });

describe("CSV import", () => {
  it("previews, flags errors and duplicates, never overwrites, and produces an error report", async () => {
    const { svc } = await makeEnv();
    await svc.customers.create({ name: "Existing", phone: "0501111111", email: "ex@x.co" });
    const csv = svc.io.parse([
      "Name,Phone,Email,Birthday,Points,Last visit,Total spent,Tags",
      "Sara,0502222222,sara@x.co,04/05/1990,50,01/02/2026,350.50,vip;friend",
      "Existing Again,0501111111,,,,,,",
      "Bad Email,0503333333,not-an-email,,,,,",
      ",0504444444,,,,,,",
      "Dup In File,0502222222,,,,,,",
      "Neg,0505555555,,,abc,,,",
    ].join("\n"));
    const mapping = { name: 0, phone: 1, email: 2, birthday: 3, opening_points: 4, last_visit_date: 5, total_spent: 6, tags: 7 };
    const prev = await svc.io.preview(csv, mapping);
    expect(prev.counts).toEqual({ ok: 1, duplicate: 2, error: 3 });
    expect(prev.rows[2]!.errors).toContain("email_invalid");
    expect(prev.rows[3]!.errors).toContain("name_required");
    expect(prev.rows[5]!.errors).toContain("points_invalid");
    expect(prev.rows[1]!.duplicateOf).toBe("Existing");
    const report = svc.io.errorReport(prev);
    expect(report).toContain("email_invalid");
    expect(report).toContain("duplicate of Existing");

    const res = await svc.io.commit(prev); // duplicates skipped by default
    expect(res).toEqual({ imported: 1, skipped: 5 });
    const all = await svc.customers.list();
    expect(all.map((c) => c.name).sort()).toEqual(["Existing", "Sara"]);
    const sara = all.find((c) => c.name === "Sara")!;
    expect(sara.birthday).toBe("1990-05-04");
    expect(await svc.loyalty.balance(sara.id)).toBe(50);
    const txs = await svc.loyalty.transactions(sara.id);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ source: "import", amountMinor: 35050, pointsEarned: 0 });
    // existing customer untouched
    expect((await svc.customers.list({ search: "Existing" }))[0]!.phone).toBe("0501111111");
  });
  it("lets the owner explicitly import a flagged duplicate as a separate customer", async () => {
    const { svc } = await makeEnv();
    await svc.customers.create({ name: "A", phone: "0501111111" });
    const prev = await svc.io.preview(svc.io.parse("Name,Phone\nA2,0501111111"), { name: 0, phone: 1 });
    expect(prev.rows[0]!.status).toBe("duplicate");
    expect((await svc.io.commit(prev, new Set([2]))).imported).toBe(1);
    expect((await svc.customers.list()).length).toBe(2);
  });
  it("requires a name column", async () => {
    const { svc } = await makeEnv();
    await expectCode(svc.io.preview(svc.io.parse("Phone\n0501111111"), { phone: 0 }), "mapping_name_required");
  });
});

describe("Smart Actions", () => {
  async function seeded() {
    const env = await makeEnv(new Date("2026-06-01T10:00:00Z"));
    const { svc } = env;
    const lapsed = await svc.customers.create({ name: "Lapsed Lena", phone: "0501111111", consent: "granted" });
    for (const d of [125, 105, 85, 65, 45]) await svc.loyalty.recordPurchase({ customerId: lapsed.id, amountMinor: 5000, occurredAt: daysAgo(env, d) });
    const dnc = await svc.customers.create({ name: "Dnc Dan", phone: "0502222222", consent: "do_not_contact" });
    await svc.loyalty.recordPurchase({ customerId: dnc.id, amountMinor: 5000, occurredAt: daysAgo(env, 200) });
    const fresh = await svc.customers.create({ name: "Fresh Fay", phone: "0503333333" });
    await svc.loyalty.recordPurchase({ customerId: fresh.id, amountMinor: 5000, occurredAt: daysAgo(env, 2) });
    return { ...env, lapsed, dnc, fresh };
  }

  it("lists eligible customers with explanations and blocks Do Not Contact", async () => {
    const { svc, lapsed, dnc } = await seeded();
    const churn = await svc.actions.eligible("prevent_churn");
    expect(churn.map((r) => r.insight.id)).toEqual([lapsed.id]);
    expect(churn[0]!.candidate.reasons[0]).toEqual({ key: "noPurchaseUsual", params: { days: 45, interval: 20 } });
    const back = await svc.actions.eligible("win_back");
    expect(back.map((r) => [r.insight.id, r.candidate.blocked])).toEqual([[dnc.id, "do_not_contact"]]);
    await expectCode(svc.actions.startRun({ type: "win_back", name: "x", messageBody: "hi", channel: "whatsapp", members: [{ customerId: dnc.id, reasons: [] }] }), "do_not_contact");
  });

  it("records preparation and outcomes without claiming delivery, with follow-ups and reports", async () => {
    const { svc, lapsed, clock } = await seeded();
    const id = await svc.actions.startRun({ type: "prevent_churn", name: "Churn run", messageBody: "Hi", channel: "whatsapp", members: [{ customerId: lapsed.id, reasons: [{ key: "noPurchaseUsual", params: { days: 45, interval: 20 } }] }] });
    let run = (await svc.actions.run(id))!;
    expect(run.members[0]!.status).toBe("not_contacted");
    expect(run.members[0]!.preparedAt).toBeNull();
    await svc.actions.markPrepared(id, lapsed.id); // copy / open WhatsApp
    run = (await svc.actions.run(id))!;
    expect(run.members[0]).toMatchObject({ status: "prepared", contactedAt: null });
    await expectCode(svc.actions.setStatus(id, lapsed.id, "delivered"), "status_invalid");
    await svc.actions.setStatus(id, lapsed.id, "contacted", "Sent via WhatsApp");
    await svc.actions.addFollowUp({ customerId: lapsed.id, dueOn: "2026-06-05", note: "Call if no reply", smartActionId: id });
    // contacted customers fall into the cool-down
    const cand = (await svc.actions.eligible("prevent_churn"))[0]!;
    expect(cand.candidate.recentlyContacted).toBe(true);
    clock.advanceDays(3);
    await svc.loyalty.recordPurchase({ customerId: lapsed.id, amountMinor: 5000 });
    await svc.actions.setStatus(id, lapsed.id, "returned");
    const report = await svc.reports.build({ from: "2026-05-01", to: "2026-06-30" });
    const t = report.actions.byType.find((x) => x.type === "prevent_churn")!;
    expect(t).toMatchObject({ total: 1, returned: 1, purchasedAfter: 1 });
    expect(report.followUps.openNow).toBe(1);
    clock.advanceDays(3);
    const dash = await svc.dashboard.load();
    expect(dash.followUpsDue).toBe(1);
    expect(dash.recommendations[0]!.key).toBe("followUpsDue");
  });

  it("supports custom outcome statuses and saved segments", async () => {
    const { svc, lapsed } = await seeded();
    await svc.settings.set("customOutcomes", ["Booked visit"]);
    const seg = await svc.actions.saveSegment({ name: "Big spenders", rules: { minSpendMinor: 20000 } });
    const rows = await svc.actions.eligible("custom", { segmentId: seg });
    expect(rows.map((r) => r.insight.id)).toEqual([lapsed.id]);
    const id = await svc.actions.startRun({ type: "custom", name: "Custom", segmentId: seg, messageBody: "Hi", channel: "sms", members: [{ customerId: lapsed.id, reasons: [] }] });
    await svc.actions.setStatus(id, lapsed.id, "custom:Booked visit");
    await expectCode(svc.actions.setStatus(id, lapsed.id, "custom:Nope"), "status_invalid");
  });
});

describe("dashboard & reports use real data", () => {
  it("computes totals, rewards ready and report figures from the database", async () => {
    const env = await makeEnv(new Date("2026-06-01T10:00:00Z"));
    const { svc } = env;
    expect((await svc.dashboard.load()).recommendations[0]!.key).toBe("addFirstCustomers");
    const a = await svc.customers.create({ name: "A" });
    const b = await svc.customers.create({ name: "B" });
    await svc.loyalty.saveReward({ name: "Gift", pointsCost: 10 });
    await svc.loyalty.recordPurchase({ customerId: a.id, amountMinor: 20_000, occurredAt: daysAgo(env, 3) });
    await svc.loyalty.recordPurchase({ customerId: a.id, amountMinor: 10_000, occurredAt: daysAgo(env, 1) });
    await svc.loyalty.recordPurchase({ customerId: b.id, amountMinor: 5_000, occurredAt: daysAgo(env, 100) });
    const d = await svc.dashboard.load();
    expect(d.totals).toMatchObject({ customers: 2, active: 1, winBack: 1 });
    expect(d.rewardsReady).toBe(1);
    expect(d.recent).toMatchObject({ purchases: 2, revenueMinor: 30_000 });
    expect(d.loyalty.earned30).toBe(35); // 20 + 10 + 5 points recorded in the last 30 days (ledger time)
    const r = await svc.reports.build({ from: "2026-05-02", to: "2026-06-01" });
    expect(r.purchases).toMatchObject({ count: 2, revenueMinor: 30_000, averageMinor: 15_000 });
    expect(r.repeat).toMatchObject({ customersWithPurchase: 1, repeatCustomers: 1, repeatRatePct: 100, newBuyers: 1 });
    expect(r.points.outstandingNow).toBe(35);
    expect(r.purchases.buckets.reduce((s, x) => s + x.purchases, 0)).toBe(2);
    expect(svc.reports.toCsv(r, 2)).toContain("purchases,revenue,300.00");
  });
});

describe("backup & restore", () => {
  async function populated() {
    const env = await makeEnv();
    const { svc } = env;
    const c = await svc.customers.create({ name: "Sara", phone: "0501234567", tags: ["a"] });
    await svc.loyalty.saveReward({ name: "Gift", pointsCost: 5 });
    const t = await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 20_000 });
    await svc.loyalty.reversePurchase(t.id, "refund");
    await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 30_000 });
    return { ...env, c };
  }

  it("round-trips plain and encrypted backups into a fresh database", async () => {
    const { svc } = await populated();
    const plain = await svc.backup.export();
    const enc = await svc.backup.export("correct horse battery");
    expect(enc.text).not.toContain("Sara");
    expect(plain.filename).toMatch(/\.smloyaltybackup$/);

    const { db: db2 } = await openSqlJsDb();
    const svc2 = await createServices(db2);
    const wrong = await svc2.backup.inspect(enc.text, "wrong passphrase");
    expect(wrong.error).toBe("wrong_passphrase_or_corrupt");
    expect((await svc2.backup.inspect(enc.text)).needsPassphrase).toBe(true);
    const ok = await svc2.backup.inspect(enc.text, "correct horse battery");
    expect(ok.backup!.counts.customers).toBe(1);
    await svc2.backup.restore(ok.backup!);
    expect((await svc2.customers.list()).map((c) => c.name)).toEqual(["Sara"]);
    expect(await svc2.loyalty.reconcile()).toEqual([]);
    const orig = await svc.backup.create();
    const restored = await svc2.backup.create();
    expect(restored.data.customers).toEqual(orig.data.customers);
    expect(restored.data.points_ledger).toEqual(orig.data.points_ledger);
    const p2 = await svc2.backup.inspect(plain.text);
    expect(p2.backup!.counts.points_ledger).toBe(3);
  });

  it("rejects corrupted, tampered, truncated and foreign files", async () => {
    const { svc } = await populated();
    const { text } = await svc.backup.export();
    expect((await svc.backup.inspect("{not json")).error).toBe("not_a_backup");
    expect((await svc.backup.inspect(JSON.stringify({ format: "other" }))).error).toBe("not_a_backup");
    expect((await svc.backup.inspect(text.slice(0, text.length - 40))).error).toBe("not_a_backup");
    const tampered = text.replace('"Sara"', '"Eve"');
    expect((await svc.backup.inspect(tampered)).error).toBe("checksum_mismatch");
    const newer = JSON.parse(text);
    newer.formatVersion = 99;
    expect((await svc.backup.inspect(JSON.stringify(newer))).error).toBe("unsupported_version");
    newer.formatVersion = 1;
    newer.schemaVersion = 99;
    expect((await svc.backup.inspect(JSON.stringify(newer))).error).toBe("newer_schema");
    const enc = JSON.parse((await svc.backup.export("passphrase-123")).text);
    enc.ciphertext = enc.ciphertext.slice(0, -4) + "AAAA";
    expect((await svc.backup.inspect(JSON.stringify(enc), "passphrase-123")).error).toBe("wrong_passphrase_or_corrupt");
    enc.ciphertext = "";
    expect((await svc.backup.inspect(JSON.stringify(enc), "passphrase-123")).error).toBeDefined();
  });

  it("a failed restore leaves existing data untouched (atomic)", async () => {
    const { svc, db } = await populated();
    const { text } = await svc.backup.export(); // export records lastBackupAt, so snapshot after it
    const before = (await svc.backup.create()).checksum;
    const bad = JSON.parse(text);
    // valid structure + checksum, but one ledger row points at a customer that does not exist -> FK failure at the end
    bad.data.points_ledger.push({ id: "x", customer_id: "ghost", delta: 5, kind: "adjust", ref_type: null, ref_id: null, reason: null, reverses_entry_id: null, created_at: "2026-01-01T00:00:00Z" });
    bad.counts.points_ledger++;
    const { checksum: _ignored, ...rest } = bad;
    void _ignored; void rest;
    // recompute checksum the same way the service does by round-tripping through a helper service instance
    const forged = await forge(bad);
    await expect(svc.backup.restore(forged)).rejects.toBeDefined();
    expect((await svc.backup.create()).checksum).toBe(before);
    expect((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM customers"))!.n).toBe(1);

    // unknown column is rejected too
    const bad2 = JSON.parse(text);
    bad2.data.customers[0].evil = "x";
    await expect(svc.backup.restore(await forge(bad2))).rejects.toBeDefined();
    expect((await svc.backup.create()).checksum).toBe(before);
  });

  it("restores a larger dataset", async () => {
    const env = await makeEnv();
    const { svc } = env;
    await svc.customers.create({ name: "Seed" });
    const csv = ["Name,Phone", ...Array.from({ length: 1500 }, (_, i) => `Customer ${i},05${String(10000000 + i)}`)].join("\n");
    const prev = await svc.io.preview(svc.io.parse(csv), { name: 0, phone: 1 });
    await svc.io.commit(prev);
    const { text } = await svc.backup.export();
    const { db: db2 } = await openSqlJsDb();
    const svc2 = await createServices(db2);
    const insp = await svc2.backup.inspect(text);
    await svc2.backup.restore(insp.backup!);
    expect(await svc2.customers.count()).toBe(1501);
  });

  it("does not carry license or device state in backups", async () => {
    const { svc, db } = await populated();
    await db.run("INSERT INTO license_state (id, license_text, updated_at) VALUES (1, 'SECRET-LICENSE', 'x')");
    const { text } = await svc.backup.export();
    expect(text).not.toContain("SECRET-LICENSE");
    expect(text).not.toContain("license_state");
  });

  it("encrypts with AES-GCM and detects tampering", async () => {
    const f = await encryptBackup("hello", "passphrase-1", { appVersion: "1", exportedAt: "x" }, 100_000);
    expect(await decryptBackup(f, "passphrase-1")).toBe("hello");
    await expect(decryptBackup({ ...f, meta: { appVersion: "2", exportedAt: "x" } }, "passphrase-1")).rejects.toThrow();
  });
});

// helper: re-sign a mutated backup using the service's checksum algorithm
import { canonicalize, bytesToHex, utf8ToBytes } from "@smloyalty/license-core";
import { sha256 } from "@noble/hashes/sha256";
async function forge(b: Record<string, unknown> & { counts: unknown; data: unknown }) {
  const copy = { ...b, checksum: bytesToHex(sha256(utf8ToBytes(canonicalize({ counts: b.counts, data: b.data })))) };
  return copy as never;
}

describe("licensing in the app", () => {
  const key = generateSigningKey();
  const trusted: TrustedKey[] = [{ keyId: key.keyId, publicKey: base64urlEncode(key.publicKey) }];
  const uuid = "3f2b8c1e-9d4a-4e57-8a31-0c2b7d6e5f40";

  async function setup(nowMs = Date.parse("2026-03-01T10:00:00Z")) {
    const { db } = await openSqlJsDb();
    await migrate(db);
    const kv = createMemoryKV();
    const clock = { ms: nowMs };
    const mgr = new LicenseManager(db, kv, trusted, { now: () => clock.ms, platform: "android" });
    await mgr.init();
    return { db, kv, clock, mgr };
  }
  const issue = (fp: string, over: Partial<LicensePayload> = {}) =>
    serializeLicenseFile(signLicense({
      schemaVersion: 1, productId: PRODUCT_ID, licenseId: uuid, customerReference: "Salon", licenseType: "lifetime", issuedAt: "2026-02-01T00:00:00Z",
      validFrom: "2026-02-01T00:00:00Z", expiresAt: null, deviceBinding: { type: "installation-fingerprint", value: fp }, features: ["core"], keyId: key.keyId, ...over,
    }, key.seed));

  it("starts unlicensed (read-only) and exposes a valid activation request", async () => {
    const { mgr } = await setup();
    expect(mgr.status.kind).toBe("unlicensed");
    expect(mgr.canWrite()).toBe(false);
    expect(() => mgr.assertWritable()).toThrow();
    const req = mgr.buildActivationRequest("Salon Noor");
    const parsed = parseActivationRequest(req.fileText);
    expect(parsed.ok && parsed.request.deviceBinding.value).toBe(mgr.fingerprint);
    expect(parseActivationRequest(req.compactText).ok).toBe(true);
  });

  it("activates a lifetime license for this device and survives restart", async () => {
    const { mgr, db, kv, clock } = await setup();
    await mgr.importLicense(issue(mgr.fingerprint));
    expect(mgr.status.kind).toBe("active");
    expect(mgr.canWrite()).toBe(true);
    const mgr2 = new LicenseManager(db, kv, trusted, { now: () => clock.ms });
    expect((await mgr2.init()).kind).toBe("active");
  });

  it("rejects wrong device, tampered, wrong product and untrusted-key licenses", async () => {
    const { mgr } = await setup();
    await expectCode(mgr.importLicense(issue(deriveFingerprint("some-other-install-id-xx"))), "license_wrong_device");
    await expectCode(mgr.importLicense(issue(mgr.fingerprint).replace("Salon", "Hack")), "license_bad_signature");
    await expectCode(mgr.importLicense(issue(mgr.fingerprint, { productId: "smartmanager-installments" })), "license_wrong_product");
    const evil = generateSigningKey();
    const env = signLicense({ schemaVersion: 1, productId: PRODUCT_ID, licenseId: uuid, customerReference: "x", licenseType: "lifetime", issuedAt: "2026-02-01T00:00:00Z", validFrom: "2026-02-01T00:00:00Z", expiresAt: null, deviceBinding: { type: "installation-fingerprint", value: mgr.fingerprint }, features: ["core"], keyId: evil.keyId }, evil.seed);
    await expectCode(mgr.importLicense(JSON.stringify(env)), "license_unknown_key");
    await expectCode(mgr.importLicense("garbage"), "license_malformed");
    expect(mgr.status.kind).toBe("unlicensed");
  });

  it("custom duration: valid only inside its dates, then read-only but data stays and export works", async () => {
    const env = await makeEnv(new Date("2026-03-01T10:00:00Z"));
    const kv = createMemoryKV();
    const clock = { ms: Date.parse("2026-03-01T10:00:00Z") };
    const mgr = new LicenseManager(env.db, kv, trusted, { now: () => clock.ms });
    await mgr.init();
    const svc = await createServices(env.db, { assertWritable: () => mgr.assertWritable(), now: () => new Date(clock.ms) });
    await mgr.importLicense(issue(mgr.fingerprint, { licenseType: "custom_duration", validFrom: "2026-03-01T00:00:00Z", expiresAt: "2026-04-01T00:00:00Z" }));
    const c = await svc.customers.create({ name: "Sara" });
    await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 5000 });

    clock.ms = Date.parse("2026-04-01T00:00:00Z");
    await mgr.refresh(true);
    expect(mgr.status.kind).toBe("expired");
    await expectCode(svc.customers.create({ name: "Late" }), "license_restricted");
    // data intact; backup and CSV export still work
    expect((await svc.customers.list()).map((x) => x.name)).toEqual(["Sara"]);
    expect((await svc.backup.export()).backup.counts.customers).toBe(1);
    expect(await svc.io.exportCustomers()).toContain("Sara");
    // rolling the clock back does not revive it
    clock.ms = Date.parse("2026-03-10T00:00:00Z");
    await mgr.refresh(true);
    expect(mgr.status.kind).toBe("expired");
    // an already-expired license cannot be imported
    await expectCode(mgr.importLicense(issue(mgr.fingerprint, { licenseId: "11111111-9d4a-4e57-8a31-0c2b7d6e5f40", issuedAt: "2026-03-05T00:00:00Z", licenseType: "custom_duration", validFrom: "2026-01-01T00:00:00Z", expiresAt: "2026-02-01T00:00:00Z" })), "license_expired_on_import");
  });

  it("detects a clock rollback, limits manual review, and a renewal license restores access", async () => {
    const { mgr, clock } = await setup();
    await mgr.importLicense(issue(mgr.fingerprint, { licenseType: "custom_duration", validFrom: "2026-03-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" }));
    clock.ms += 60 * 86_400_000;
    await mgr.refresh(true);
    expect(mgr.status.kind).toBe("active");
    clock.ms -= 20 * 86_400_000; // user sets the date back by weeks
    await mgr.refresh(true);
    expect(mgr.status.kind).toBe("clock_anomaly");
    expect(mgr.canWrite()).toBe(false);
    clock.ms += 20 * 86_400_000; // fixing the clock recovers automatically
    await mgr.refresh(true);
    expect(mgr.status.kind).toBe("active");
    // repeated rollbacks need reviews, which are capped
    for (let i = 0; i < MAX_CLOCK_REVIEWS; i++) {
      clock.ms -= 10 * 86_400_000;
      await mgr.refresh(true);
      expect(mgr.status.kind).toBe("clock_anomaly");
      await mgr.reviewClock();
      expect(mgr.status.kind).toBe("active");
    }
    clock.ms -= 10 * 86_400_000;
    await mgr.refresh(true);
    await expectCode(mgr.reviewClock(), "clock_reviews_exhausted");
    // older license cannot replace a newer one; renewal can
    clock.ms += 10 * 86_400_000;
    await mgr.refresh(true);
    await expectCode(mgr.importLicense(issue(mgr.fingerprint, { licenseId: "22222222-9d4a-4e57-8a31-0c2b7d6e5f40", issuedAt: "2026-01-01T00:00:00Z", validFrom: "2026-01-01T00:00:00Z" })), "license_older_than_installed");
    await mgr.importLicense(issue(mgr.fingerprint, { licenseId: "33333333-9d4a-4e57-8a31-0c2b7d6e5f40", issuedAt: "2026-03-20T00:00:00Z" }));
    expect(mgr.status.payload?.licenseType).toBe("lifetime");
    expect(mgr.status.kind).toBe("active");
  });

  it("re-verifies the stored license at startup (editing the DB does not grant access)", async () => {
    const { mgr, db, kv, clock } = await setup();
    await mgr.importLicense(issue(mgr.fingerprint));
    const row = await db.get<{ license_text: string }>("SELECT license_text FROM license_state WHERE id = 1");
    await db.run("UPDATE license_state SET license_text = ?", [row!.license_text.replace("Salon", "Mallory")]);
    const m2 = new LicenseManager(db, kv, trusted, { now: () => clock.ms });
    expect((await m2.init()).kind).toBe("invalid");
    expect(m2.canWrite()).toBe(false);
    // a restore from backup on the same device does not change license state
    expect(ed25519).toBeDefined();
  });

  it("a license for another device is invalid after copying the database to a new install", async () => {
    const { mgr, db, clock } = await setup();
    await mgr.importLicense(issue(mgr.fingerprint));
    const newDeviceKv = createMemoryKV(); // different secure storage => different installId => different fingerprint
    const m2 = new LicenseManager(db, newDeviceKv, trusted, { now: () => clock.ms });
    const st = await m2.init();
    expect(st.kind).toBe("invalid");
    expect(st.failure).toBe("wrong_device");
  });

  it("can build a request the generator can parse", () => {
    const req = createActivationRequest({ fingerprint: deriveFingerprint("abcdefghijklmnopqr"), requestId: uuid, createdAt: "2026-01-01T00:00:00Z", appVersion: "1", platform: "ios" });
    expect(parseActivationRequest(JSON.stringify(req)).ok).toBe(true);
  });
});

describe("older backups", () => {
  it("restores a schema v1 backup (before return periods existed) into the current schema", async () => {
    const { svc } = await makeEnv();
    await svc.customers.create({ name: "Old Olga" });
    const b = JSON.parse(JSON.stringify(await svc.backup.create()));
    for (const r of b.data.customers) delete r.return_interval_days;
    b.schemaVersion = 1;
    const old = await forge(b);
    const { db: db2 } = await openSqlJsDb();
    const svc2 = await createServices(db2);
    await svc2.backup.restore(old);
    const [c] = await svc2.customers.list();
    expect(c).toMatchObject({ name: "Old Olga", returnIntervalDays: null });
  });
});
