import { describe, expect, it } from "vitest";
import { DomainError } from "../database/db";
import { daysAgo, makeEnv } from "./helpers";

const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toMatchObject({ name: "DomainError", code });
};

describe("customers", () => {
  it("creates, searches (name/phone/email/code), edits, archives and exports", async () => {
    const { svc } = await makeEnv();
    const a = await svc.customers.create({ name: "Sara Ali", phone: "0501234567", email: "Sara@Example.com", tags: ["vip friend", "Salon"], birthday: "1990-05-04", consent: "granted" });
    await svc.customers.create({ name: "Omar Khan", phone: "+971 55 111 2222" });
    expect(a.code).toBe("C-0001");
    expect(a.phoneNorm).toBe("966501234567");
    expect((await svc.customers.list({ search: "sara" })).map((c) => c.name)).toEqual(["Sara Ali"]);
    expect((await svc.customers.list({ search: "501234567" })).length).toBe(1);
    expect((await svc.customers.list({ search: "example.com" })).length).toBe(1);
    expect((await svc.customers.list({ search: "c-0002" })).map((c) => c.name)).toEqual(["Omar Khan"]);
    expect((await svc.customers.list({ search: "100%" })).length).toBe(0); // LIKE wildcards are escaped
    const u = await svc.customers.update(a.id, { name: "Sara A.", phone: "0501234567", tags: ["salon"] });
    expect(u.tags).toEqual(["Salon"]); // tags are case-insensitive and reuse the existing one
    await svc.customers.setArchived(a.id, true);
    expect((await svc.customers.list()).length).toBe(1);
    expect((await svc.customers.list({ onlyArchived: true })).length).toBe(1);
    expect(await svc.io.exportCustomers()).toContain("Sara A.");
  });
  it("validates input and detects (never merges) duplicates", async () => {
    const { svc } = await makeEnv();
    await expectCode(svc.customers.create({ name: " " }), "name_required");
    await expectCode(svc.customers.create({ name: "X", email: "nope" }), "email_invalid");
    await expectCode(svc.customers.create({ name: "X", phone: "12" }), "phone_invalid");
    await expectCode(svc.customers.create({ name: "X", birthday: "2026-02-30" }), "birthday_invalid");
    const a = await svc.customers.create({ name: "Sara", phone: "0501234567" });
    const dups = await svc.customers.findDuplicates({ name: "Other", phone: "+966501234567" });
    expect(dups.map((d) => d.customer.id)).toEqual([a.id]);
    expect(dups[0]!.matchedOn).toEqual(["phone"]);
    const b = await svc.customers.create({ name: "Sara 2", phone: "0501234567" }); // allowed after the warning
    expect(b.id).not.toBe(a.id);
  });
  it("deletes a customer permanently with all history", async () => {
    const { svc, db } = await makeEnv();
    const c = await svc.customers.create({ name: "Gone" });
    await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 5000 });
    await svc.customers.deletePermanently(c.id);
    expect((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM transactions"))!.n).toBe(0);
    expect((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM points_ledger"))!.n).toBe(0);
  });
});

describe("customer return period", () => {
  it("is saved from the form fields, validated, and drives the insight", async () => {
    const env = await makeEnv(new Date("2026-06-01T10:00:00Z"));
    const { svc } = env;
    const c = await svc.customers.create({ name: "Weekly Wendy", returnIntervalDays: 7 });
    expect(c.returnIntervalDays).toBe(7);
    await expectCode(svc.customers.create({ name: "Bad", returnIntervalDays: 0 }), "return_interval_invalid");
    await expectCode(svc.customers.create({ name: "Bad", returnIntervalDays: 731 }), "return_interval_invalid");
    expect((await svc.customers.create({ name: "Auto" })).returnIntervalDays).toBeNull();
    await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 1000, occurredAt: daysAgo(env, 13) });
    await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 1000, occurredAt: daysAgo(env, 40) });
    const i = (await svc.insights.loadOne(c.id))!;
    expect(i.intervalCustom).toBe(true);
    expect(i.band).toBe("at_risk");
    const u = await svc.customers.update(c.id, { name: "Weekly Wendy", returnIntervalDays: null });
    expect(u.returnIntervalDays).toBeNull();
    expect((await svc.insights.loadOne(c.id))!.intervalCustom).toBe(false);
  });
  it("can be imported from CSV and is part of backups (schema v2)", async () => {
    const { svc } = await makeEnv();
    const prev = await svc.io.preview(svc.io.parse("Name,Return days\nA,14\nB,abc"), { name: 0, return_days: 1 });
    expect(prev.rows[1]!.errors).toContain("return_interval_invalid");
    await svc.io.commit(prev);
    expect((await svc.customers.list())[0]!.returnIntervalDays).toBe(14);
    const b = await svc.backup.create();
    expect(b.schemaVersion).toBe(2);
    expect(b.data.customers![0]).toHaveProperty("return_interval_days", 14);
  });
});

describe("transactions, ledger, redemption", () => {
  it("earns points from purchases and keeps the ledger as source of truth", async () => {
    const { svc } = await makeEnv();
    const c = await svc.customers.create({ name: "Sara" });
    const t = await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 12_550 }); // 125.50 -> 12 points
    expect(t.pointsEarned).toBe(12);
    expect(await svc.loyalty.balance(c.id)).toBe(12);
    expect((await svc.loyalty.ledger(c.id))[0]).toMatchObject({ delta: 12, kind: "earn", refId: t.id });
    expect(await svc.loyalty.reconcile()).toEqual([]);
  });
  it("applies a VIP multiplier computed from prior history", async () => {
    const { svc, clock } = await makeEnv();
    const c = await svc.customers.create({ name: "Loyal" });
    await svc.loyalty.saveTier({ name: "Gold", minSpendMinor: 0, minVisits: 2, earnMultiplierPct: 150 });
    for (let i = 0; i < 3; i++) {
      await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 10_000, occurredAt: new Date(clock.now.getTime() - (3 - i) * 86_400_000).toISOString() });
    }
    // first two are base (10 pts each), third happens once 2 visits exist: 10 * 1.5 = 15
    expect((await svc.loyalty.transactions(c.id)).map((t) => t.pointsEarned).sort((a, b) => a - b)).toEqual([10, 10, 15]);
  });
  it("redeems rewards with validation done in the domain layer", async () => {
    const { svc, clock } = await makeEnv();
    const c = await svc.customers.create({ name: "Sara" });
    const reward = await svc.loyalty.saveReward({ name: "Free coffee", pointsCost: 10 });
    await expectCode(svc.loyalty.redeemReward({ customerId: c.id, rewardId: reward }), "insufficient_points");
    await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 20_000 }); // 20 points
    const red = await svc.loyalty.redeemReward({ customerId: c.id, rewardId: reward });
    expect(red).toMatchObject({ status: "redeemed", pointsCost: 10 });
    expect(await svc.loyalty.balance(c.id)).toBe(10);
    // disabled and expired rewards cannot be redeemed
    await svc.loyalty.saveReward({ id: reward, name: "Free coffee", pointsCost: 10, active: false });
    await expectCode(svc.loyalty.redeemReward({ customerId: c.id, rewardId: reward }), "reward_disabled");
    const exp = await svc.loyalty.saveReward({ name: "Seasonal", pointsCost: 5, expiresAt: new Date(clock.now.getTime() + 86_400_000).toISOString() });
    await svc.loyalty.redeemReward({ customerId: c.id, rewardId: exp });
    clock.advanceDays(2);
    await expectCode(svc.loyalty.redeemReward({ customerId: c.id, rewardId: exp }), "reward_expired");
    expect(await svc.loyalty.balance(c.id)).toBe(5);
  });
  it("cancelling a redemption refunds points once and keeps history", async () => {
    const { svc } = await makeEnv();
    const c = await svc.customers.create({ name: "Sara" });
    const reward = await svc.loyalty.saveReward({ name: "Gift", pointsCost: 10 });
    await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 10_000 });
    const red = await svc.loyalty.redeemReward({ customerId: c.id, rewardId: reward });
    await expectCode(svc.loyalty.cancelRedemption(red.id, ""), "reason_required");
    await svc.loyalty.cancelRedemption(red.id, "Customer changed mind");
    expect(await svc.loyalty.balance(c.id)).toBe(10);
    await expectCode(svc.loyalty.cancelRedemption(red.id, "again"), "already_cancelled");
    expect((await svc.loyalty.ledger(c.id)).length).toBe(3);
    expect(await svc.loyalty.reconcile()).toEqual([]);
  });
  it("reverses purchases without deleting history and never twice", async () => {
    const { svc } = await makeEnv();
    const c = await svc.customers.create({ name: "Sara" });
    const t = await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 5_000 });
    await expectCode(svc.loyalty.reversePurchase(t.id, " "), "reason_required");
    await svc.loyalty.reversePurchase(t.id, "Refund");
    expect(await svc.loyalty.balance(c.id)).toBe(0);
    expect((await svc.loyalty.getTransaction(t.id))!.status).toBe("reversed");
    expect((await svc.loyalty.ledger(c.id)).map((l) => l.kind).sort()).toEqual(["earn", "reversal"]);
    await expectCode(svc.loyalty.reversePurchase(t.id, "again"), "already_reversed");
    expect(await svc.loyalty.reconcile()).toEqual([]);
  });
  it("requires a reason for manual adjustments and refuses negative balances", async () => {
    const { svc } = await makeEnv();
    const c = await svc.customers.create({ name: "Sara" });
    await expectCode(svc.loyalty.adjustPoints(c.id, 10, ""), "reason_required");
    await svc.loyalty.adjustPoints(c.id, 10, "Welcome gift");
    await expectCode(svc.loyalty.adjustPoints(c.id, -11, "oops"), "insufficient_points");
    await svc.loyalty.adjustPoints(c.id, -4, "Correction");
    expect(await svc.loyalty.balance(c.id)).toBe(6);
  });
  it("rolls the whole purchase back if any step fails (atomic)", async () => {
    const { svc, db } = await makeEnv();
    const c = await svc.customers.create({ name: "Sara" });
    const offer = await svc.loyalty.saveOffer({ name: "Expired", startsOn: "2020-01-01", endsOn: "2020-02-01", audience: "all" });
    await expectCode(svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 5_000, offerId: offer }), "offer_expired");
    expect((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM transactions"))!.n).toBe(0);
    expect(await svc.loyalty.balance(c.id)).toBe(0);
  });
  it("blocks mutations when the license is restricted, but reads still work", async () => {
    let restricted = false;
    const { svc } = await makeEnv(undefined, () => {
      if (restricted) throw new DomainError("license_restricted");
    });
    const c = await svc.customers.create({ name: "Sara" });
    await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 1000 });
    restricted = true;
    await expectCode(svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 1000 }), "license_restricted");
    await expectCode(svc.customers.create({ name: "New" }), "license_restricted");
    expect((await svc.customers.list()).length).toBe(1);
    expect(await svc.loyalty.balance(c.id)).toBe(1);
    expect((await svc.backup.create()).counts.customers).toBe(1);
    expect(await svc.io.exportCustomers()).toContain("Sara");
  });
});

describe("offers", () => {
  it("enforces dates, audience and usage limits", async () => {
    const { svc, clock } = await makeEnv();
    const a = await svc.customers.create({ name: "A" });
    const b = await svc.customers.create({ name: "B" });
    const o = await svc.loyalty.saveOffer({ name: "Ten off", startsOn: "2026-03-01", endsOn: "2026-03-31", audience: "selected", customerIds: [a.id], usageLimitPerCustomer: 1 });
    await expectCode(svc.loyalty.redeemOffer(o, b.id), "offer_not_eligible");
    await svc.loyalty.redeemOffer(o, a.id);
    await expectCode(svc.loyalty.redeemOffer(o, a.id), "offer_limit_reached");
    const total = await svc.loyalty.saveOffer({ name: "Only two", startsOn: "2026-03-01", audience: "all", usageLimitTotal: 1 });
    await svc.loyalty.redeemOffer(total, a.id);
    await expectCode(svc.loyalty.redeemOffer(total, b.id), "offer_limit_reached");
    const future = await svc.loyalty.saveOffer({ name: "Soon", startsOn: "2026-04-01", audience: "all" });
    await expectCode(svc.loyalty.redeemOffer(future, a.id), "offer_disabled");
    clock.advanceDays(40);
    await expectCode(svc.loyalty.redeemOffer(o, b.id), "offer_expired");
  });
  it("supports segment audiences via live insights and cancels the redemption when a purchase is reversed", async () => {
    const { svc, clock } = await makeEnv();
    const c = await svc.customers.create({ name: "Lapsed" });
    await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 1000, occurredAt: daysAgo({ clock } as never, 100) });
    const o = await svc.loyalty.saveOffer({ name: "Come back", startsOn: "2026-01-01", audience: "segment", audienceKey: "band:inactive" });
    const t = await svc.loyalty.recordPurchase({ customerId: c.id, amountMinor: 2000, offerId: o });
    expect((await svc.loyalty.offerRedemptionCounts()).get(o)).toBe(1);
    await svc.loyalty.reversePurchase(t.id, "refund");
    expect((await svc.loyalty.offerRedemptionCounts()).get(o) ?? 0).toBe(0);
  });
});
