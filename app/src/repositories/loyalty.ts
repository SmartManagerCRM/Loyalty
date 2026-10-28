import type { Db } from "../database/db";
import { DomainError } from "../database/db";
import { audit, AppContext, requireInt, requireText, uuid } from "./context";
import { computeEarnedPoints, validateEarnRule } from "../domain/earn";
import { localDate } from "../domain/dates";
import { sanitizeText } from "../domain/phone";
import type { LedgerEntry, LedgerKind, Offer, Redemption, Reward, TransactionRow, VipTier, AudienceType } from "../domain/types";
import type { EarnRule } from "../domain/settings";
import type { SettingsRepo } from "./settings";

const iso = (s: string) => s;

export interface CustomerStats {
  visitCount: number;
  spendMinor: number;
}

/** Transactions, points ledger, rewards, VIP tiers and offers. All multi-row writes use DB transactions. */
export class LoyaltyService {
  constructor(private readonly ctx: AppContext, private readonly settings: SettingsRepo) {}

  // ───────────────────────── balances & ledger ─────────────────────────
  async balance(customerId: string, db: Db = this.ctx.db): Promise<number> {
    const r = await db.get<{ b: number | null }>("SELECT COALESCE(SUM(delta),0) AS b FROM points_ledger WHERE customer_id = ?", [customerId]);
    return Number(r?.b ?? 0);
  }

  async balances(): Promise<Map<string, number>> {
    const rows = await this.ctx.db.all<{ customer_id: string; b: number }>("SELECT customer_id, SUM(delta) AS b FROM points_ledger GROUP BY customer_id");
    return new Map(rows.map((r) => [r.customer_id, Number(r.b)]));
  }

  async ledger(customerId: string, limit = 200): Promise<LedgerEntry[]> {
    const rows = await this.ctx.db.all<Record<string, unknown>>(
      "SELECT * FROM points_ledger WHERE customer_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?", [customerId, limit]);
    return rows.map(toLedger);
  }

  private async addLedger(tx: Db, e: { customerId: string; delta: number; kind: LedgerKind; refType?: string; refId?: string; reason?: string | null; reverses?: string }): Promise<string> {
    const id = uuid();
    await tx.run(
      "INSERT INTO points_ledger (id, customer_id, delta, kind, ref_type, ref_id, reason, reverses_entry_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, e.customerId, e.delta, e.kind, e.refType ?? null, e.refId ?? null, e.reason ?? null, e.reverses ?? null, this.ctx.now().toISOString()],
    );
    return id;
  }

  async adjustPoints(customerId: string, delta: number, reason: string): Promise<void> {
    this.ctx.assertWritable();
    if (!Number.isInteger(delta) || delta === 0) throw new DomainError("adjust_invalid");
    const why = requireText(sanitizeText(reason, 300), "reason_required", 300);
    await this.ctx.db.transaction(async (tx) => {
      await this.requireCustomer(tx, customerId);
      const bal = await this.balance(customerId, tx);
      if (bal + delta < 0) throw new DomainError("insufficient_points", undefined, { balance: bal });
      const entryId = await this.addLedger(tx, { customerId, delta, kind: "adjust", reason: why });
      await audit(tx, this.ctx, "points", entryId, "adjust", { customerId, delta, reason: why });
    });
  }

  private async requireCustomer(tx: Db, id: string, allowArchived = false) {
    const c = await tx.get<{ archived_at: string | null }>("SELECT archived_at FROM customers WHERE id = ?", [id]);
    if (!c) throw new DomainError("not_found");
    if (c.archived_at && !allowArchived) throw new DomainError("customer_archived");
  }

  // ───────────────────────── VIP tiers ─────────────────────────
  async tiers(includeInactive = false): Promise<VipTier[]> {
    const rows = await this.ctx.db.all<Record<string, unknown>>(`SELECT * FROM vip_tiers ${includeInactive ? "" : "WHERE active = 1"} ORDER BY sort_order, min_spend_minor`);
    return rows.map(toTier);
  }

  /** Highest tier (by sort order descending = most demanding) the stats satisfy. */
  static tierFor(stats: CustomerStats, tiers: VipTier[]): VipTier | null {
    const ok = tiers.filter((t) => t.active && (t.minSpendMinor > 0 || t.minVisits > 0) && stats.spendMinor >= t.minSpendMinor && stats.visitCount >= t.minVisits);
    return ok.sort((a, b) => b.sortOrder - a.sortOrder || b.minSpendMinor - a.minSpendMinor)[0] ?? null;
  }

  async saveTier(input: Omit<VipTier, "id" | "sortOrder" | "active"> & { id?: string; sortOrder?: number; active?: boolean }): Promise<string> {
    this.ctx.assertWritable();
    const name = requireText(sanitizeText(input.name, 60), "name_required", 60);
    requireInt(input.minSpendMinor, "invalid_number");
    requireInt(input.minVisits, "invalid_number");
    if (input.minSpendMinor === 0 && input.minVisits === 0) throw new DomainError("tier_needs_threshold");
    if (!Number.isInteger(input.earnMultiplierPct) || input.earnMultiplierPct < 100 || input.earnMultiplierPct > 1000) throw new DomainError("multiplier_invalid");
    const now = this.ctx.now().toISOString();
    const id = input.id ?? uuid();
    await this.ctx.db.transaction(async (tx) => {
      if (input.id) {
        const r = await tx.run("UPDATE vip_tiers SET name=?, min_spend_minor=?, min_visits=?, earn_multiplier_pct=?, benefits=?, sort_order=?, active=?, updated_at=? WHERE id=?",
          [name, input.minSpendMinor, input.minVisits, input.earnMultiplierPct, input.benefits ? sanitizeText(input.benefits, 500) : null, input.sortOrder ?? 0, input.active === false ? 0 : 1, now, id]);
        if (!r.changes) throw new DomainError("not_found");
      } else {
        const max = await tx.get<{ m: number | null }>("SELECT MAX(sort_order) AS m FROM vip_tiers");
        await tx.run("INSERT INTO vip_tiers (id, name, min_spend_minor, min_visits, earn_multiplier_pct, benefits, sort_order, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [id, name, input.minSpendMinor, input.minVisits, input.earnMultiplierPct, input.benefits ? sanitizeText(input.benefits, 500) : null, input.sortOrder ?? (max?.m ?? 0) + 1, 1, now, now]);
      }
      await audit(tx, this.ctx, "vip_tier", id, input.id ? "update" : "create");
    });
    return id;
  }

  async deleteTier(id: string): Promise<void> {
    this.ctx.assertWritable();
    await this.ctx.db.transaction(async (tx) => {
      await tx.run("DELETE FROM vip_tiers WHERE id = ?", [id]);
      await audit(tx, this.ctx, "vip_tier", id, "delete");
    });
  }

  async customerStats(customerId: string, db: Db = this.ctx.db): Promise<CustomerStats> {
    const rows = await db.all<{ occurred_at: string; amount_minor: number }>("SELECT occurred_at, amount_minor FROM transactions WHERE customer_id = ? AND status = 'active'", [customerId]);
    return { visitCount: new Set(rows.map((r) => localDate(r.occurred_at))).size, spendMinor: rows.reduce((a, r) => a + r.amount_minor, 0) };
  }

  // ───────────────────────── purchases ─────────────────────────
  async saveEarnRule(rule: EarnRule): Promise<void> {
    const err = validateEarnRule(rule);
    if (err) throw new DomainError(err);
    await this.settings.set("earnRule", rule);
  }

  /** Preview points for an amount for a given customer (applies the VIP multiplier). */
  async previewPoints(customerId: string, amountMinor: number): Promise<{ points: number; multiplierPct: number; tier: VipTier | null }> {
    const [rule, tiers, stats] = await Promise.all([this.settings.get("earnRule"), this.tiers(), this.customerStats(customerId)]);
    const tier = LoyaltyService.tierFor(stats, tiers);
    const multiplierPct = tier?.earnMultiplierPct ?? 100;
    return { points: computeEarnedPoints(amountMinor, rule, multiplierPct), multiplierPct, tier };
  }

  async recordPurchase(input: { customerId: string; amountMinor: number; occurredAt?: string; note?: string | null; offerId?: string | null; source?: "manual" | "import"; skipPoints?: boolean }): Promise<TransactionRow> {
    this.ctx.assertWritable();
    requireInt(input.amountMinor, "amount_invalid");
    const occurredAt = input.occurredAt ?? this.ctx.now().toISOString();
    if (Number.isNaN(Date.parse(occurredAt))) throw new DomainError("date_invalid");
    if (Date.parse(occurredAt) > this.ctx.now().getTime() + 24 * 3600_000) throw new DomainError("date_in_future");
    const rule = await this.settings.get("earnRule");
    const segmentOk = input.offerId ? await this.segmentAudienceOk(input.offerId, input.customerId) : true;
    const id = uuid();
    return this.ctx.db.transaction(async (tx) => {
      await this.requireCustomer(tx, input.customerId);
      const tierRows = (await tx.all<Record<string, unknown>>("SELECT * FROM vip_tiers WHERE active = 1")).map(toTier);
      const stats = await this.customerStats(input.customerId, tx);
      const tier = LoyaltyService.tierFor(stats, tierRows);
      const points = input.skipPoints ? 0 : computeEarnedPoints(input.amountMinor, rule, tier?.earnMultiplierPct ?? 100);
      await tx.run(
        "INSERT INTO transactions (id, customer_id, amount_minor, occurred_at, note, source, points_earned, status, created_at) VALUES (?,?,?,?,?,?,?,'active',?)",
        [id, input.customerId, input.amountMinor, occurredAt, input.note ? sanitizeText(input.note, 300) : null, input.source ?? "manual", points, this.ctx.now().toISOString()],
      );
      if (points > 0) await this.addLedger(tx, { customerId: input.customerId, delta: points, kind: "earn", refType: "transaction", refId: id, reason: tier ? `${tier.earnMultiplierPct}%` : null });
      if (input.offerId) await this.redeemOfferInTx(tx, input.offerId, input.customerId, id, segmentOk);
      await audit(tx, this.ctx, "transaction", id, "create", { customerId: input.customerId, amountMinor: input.amountMinor, points });
      return (await this.getTransaction(id, tx))!;
    });
  }

  async getTransaction(id: string, db: Db = this.ctx.db): Promise<TransactionRow | null> {
    const r = await db.get<Record<string, unknown>>("SELECT * FROM transactions WHERE id = ?", [id]);
    return r ? toTx(r) : null;
  }

  async transactions(customerId: string, limit = 200): Promise<TransactionRow[]> {
    return (await this.ctx.db.all<Record<string, unknown>>("SELECT * FROM transactions WHERE customer_id = ? ORDER BY occurred_at DESC, rowid DESC LIMIT ?", [customerId, limit])).map(toTx);
  }

  /** Cancel a purchase. History is kept: the purchase is marked reversed and an offsetting ledger entry is added. */
  async reversePurchase(transactionId: string, reason: string): Promise<void> {
    this.ctx.assertWritable();
    const why = requireText(sanitizeText(reason, 300), "reason_required", 300);
    await this.ctx.db.transaction(async (tx) => {
      const t = await this.getTransaction(transactionId, tx);
      if (!t) throw new DomainError("not_found");
      if (t.status === "reversed") throw new DomainError("already_reversed");
      await tx.run("UPDATE transactions SET status='reversed', reversed_at=?, reversal_reason=? WHERE id=?", [this.ctx.now().toISOString(), why, transactionId]);
      if (t.pointsEarned > 0) {
        const earn = await tx.get<{ id: string }>("SELECT id FROM points_ledger WHERE ref_type='transaction' AND ref_id=? AND kind='earn'", [transactionId]);
        if (!earn) throw new DomainError("ledger_inconsistent");
        await this.addLedger(tx, { customerId: t.customerId, delta: -t.pointsEarned, kind: "reversal", refType: "transaction", refId: transactionId, reason: why, reverses: earn.id });
      }
      await tx.run("UPDATE offer_redemptions SET status='cancelled' WHERE transaction_id = ? AND status='redeemed'", [transactionId]);
      await audit(tx, this.ctx, "transaction", transactionId, "reverse", { reason: why });
    });
  }

  // ───────────────────────── rewards ─────────────────────────
  async rewards(opts: { includeArchived?: boolean } = {}): Promise<Reward[]> {
    return (await this.ctx.db.all<Record<string, unknown>>(`SELECT * FROM rewards ${opts.includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY points_cost, name COLLATE NOCASE`)).map(toReward);
  }

  static isRewardRedeemable(r: Reward, now: Date): boolean {
    return r.active && !r.archivedAt && (!r.expiresAt || Date.parse(r.expiresAt) > now.getTime());
  }

  async saveReward(input: { id?: string; name: string; description?: string | null; pointsCost: number; active?: boolean; expiresAt?: string | null }): Promise<string> {
    this.ctx.assertWritable();
    const name = requireText(sanitizeText(input.name, 80), "name_required", 80);
    requireInt(input.pointsCost, "points_cost_invalid", 1);
    if (input.expiresAt && Number.isNaN(Date.parse(input.expiresAt))) throw new DomainError("date_invalid");
    const id = input.id ?? uuid();
    const now = this.ctx.now().toISOString();
    await this.ctx.db.transaction(async (tx) => {
      if (input.id) {
        const r = await tx.run("UPDATE rewards SET name=?, description=?, points_cost=?, active=?, expires_at=?, updated_at=? WHERE id=?",
          [name, input.description ? sanitizeText(input.description, 300) : null, input.pointsCost, input.active === false ? 0 : 1, input.expiresAt ?? null, now, id]);
        if (!r.changes) throw new DomainError("not_found");
      } else {
        await tx.run("INSERT INTO rewards (id, name, description, points_cost, active, expires_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
          [id, name, input.description ? sanitizeText(input.description, 300) : null, input.pointsCost, input.active === false ? 0 : 1, input.expiresAt ?? null, now, now]);
      }
      await audit(tx, this.ctx, "reward", id, input.id ? "update" : "create");
    });
    return id;
  }

  async archiveReward(id: string): Promise<void> {
    this.ctx.assertWritable();
    await this.ctx.db.transaction(async (tx) => {
      await tx.run("UPDATE rewards SET archived_at=?, active=0 WHERE id=?", [this.ctx.now().toISOString(), id]);
      await audit(tx, this.ctx, "reward", id, "archive");
    });
  }

  /** Validation lives here (not only in the UI): reward must be redeemable and the balance sufficient. */
  async redeemReward(input: { customerId: string; rewardId: string; note?: string | null }): Promise<Redemption> {
    this.ctx.assertWritable();
    const id = uuid();
    return this.ctx.db.transaction(async (tx) => {
      await this.requireCustomer(tx, input.customerId);
      const row = await tx.get<Record<string, unknown>>("SELECT * FROM rewards WHERE id = ?", [input.rewardId]);
      if (!row) throw new DomainError("not_found");
      const reward = toReward(row);
      if (!reward.active || reward.archivedAt) throw new DomainError("reward_disabled");
      if (!LoyaltyService.isRewardRedeemable(reward, this.ctx.now())) throw new DomainError("reward_expired");
      const bal = await this.balance(input.customerId, tx);
      if (bal < reward.pointsCost) throw new DomainError("insufficient_points", undefined, { balance: bal, cost: reward.pointsCost });
      const now = this.ctx.now().toISOString();
      await tx.run(
        "INSERT INTO reward_redemptions (id, customer_id, reward_id, reward_name, points_cost, status, redeemed_at, note, created_at) VALUES (?,?,?,?,?,'redeemed',?,?,?)",
        [id, input.customerId, reward.id, reward.name, reward.pointsCost, now, input.note ? sanitizeText(input.note, 300) : null, now],
      );
      await this.addLedger(tx, { customerId: input.customerId, delta: -reward.pointsCost, kind: "redeem", refType: "redemption", refId: id, reason: reward.name });
      await audit(tx, this.ctx, "redemption", id, "redeem", { customerId: input.customerId, rewardId: reward.id, cost: reward.pointsCost });
      return (await this.getRedemption(id, tx))!;
    });
  }

  async getRedemption(id: string, db: Db = this.ctx.db): Promise<Redemption | null> {
    const r = await db.get<Record<string, unknown>>("SELECT * FROM reward_redemptions WHERE id = ?", [id]);
    return r ? toRedemption(r) : null;
  }

  async redemptions(opts: { customerId?: string; limit?: number } = {}): Promise<Redemption[]> {
    const rows = await this.ctx.db.all<Record<string, unknown>>(
      `SELECT * FROM reward_redemptions ${opts.customerId ? "WHERE customer_id = ?" : ""} ORDER BY redeemed_at DESC, rowid DESC LIMIT ?`,
      opts.customerId ? [opts.customerId, opts.limit ?? 200] : [opts.limit ?? 200],
    );
    return rows.map(toRedemption);
  }

  async cancelRedemption(id: string, reason: string): Promise<void> {
    this.ctx.assertWritable();
    const why = requireText(sanitizeText(reason, 300), "reason_required", 300);
    await this.ctx.db.transaction(async (tx) => {
      const red = await this.getRedemption(id, tx);
      if (!red) throw new DomainError("not_found");
      if (red.status === "cancelled") throw new DomainError("already_cancelled");
      const entry = await tx.get<{ id: string }>("SELECT id FROM points_ledger WHERE ref_type='redemption' AND ref_id=? AND kind='redeem'", [id]);
      if (!entry) throw new DomainError("ledger_inconsistent");
      const now = this.ctx.now().toISOString();
      await tx.run("UPDATE reward_redemptions SET status='cancelled', cancelled_at=?, cancel_reason=? WHERE id=?", [now, why, id]);
      await this.addLedger(tx, { customerId: red.customerId, delta: red.pointsCost, kind: "redeem_reversal", refType: "redemption", refId: id, reason: why, reverses: entry.id });
      await audit(tx, this.ctx, "redemption", id, "cancel", { reason: why });
    });
  }

  // ───────────────────────── offers ─────────────────────────
  async offers(opts: { includeArchived?: boolean } = {}): Promise<Offer[]> {
    return (await this.ctx.db.all<Record<string, unknown>>(`SELECT * FROM offers ${opts.includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY starts_on DESC, name COLLATE NOCASE`)).map(toOffer);
  }

  static offerState(o: Offer, today: string): "inactive" | "scheduled" | "expired" | "live" {
    if (!o.active || o.archivedAt) return "inactive";
    if (today < o.startsOn) return "scheduled";
    if (o.endsOn && today > o.endsOn) return "expired";
    return "live";
  }

  async saveOffer(input: { id?: string; name: string; description?: string | null; startsOn: string; endsOn?: string | null; active?: boolean; usageLimitTotal?: number | null; usageLimitPerCustomer?: number | null; audience: AudienceType; audienceKey?: string | null; customerIds?: string[] }): Promise<string> {
    this.ctx.assertWritable();
    const name = requireText(sanitizeText(input.name, 80), "name_required", 80);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) throw new DomainError("date_invalid");
    if (input.endsOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.endsOn) || input.endsOn < input.startsOn)) throw new DomainError("offer_dates_invalid");
    for (const lim of [input.usageLimitTotal, input.usageLimitPerCustomer]) if (lim != null) requireInt(lim, "limit_invalid", 1);
    if (input.audience === "segment" && !input.audienceKey) throw new DomainError("audience_required");
    if (input.audience === "selected" && !(input.customerIds?.length)) throw new DomainError("audience_required");
    const id = input.id ?? uuid();
    const now = this.ctx.now().toISOString();
    await this.ctx.db.transaction(async (tx) => {
      const vals = [name, input.description ? sanitizeText(input.description, 300) : null, input.startsOn, input.endsOn ?? null, input.active === false ? 0 : 1, input.usageLimitTotal ?? null, input.usageLimitPerCustomer ?? null, input.audience, input.audience === "segment" ? input.audienceKey ?? null : null];
      if (input.id) {
        const r = await tx.run("UPDATE offers SET name=?, description=?, starts_on=?, ends_on=?, active=?, usage_limit_total=?, usage_limit_per_customer=?, audience=?, audience_key=?, updated_at=? WHERE id=?", [...vals, now, id]);
        if (!r.changes) throw new DomainError("not_found");
      } else {
        await tx.run("INSERT INTO offers (id, name, description, starts_on, ends_on, active, usage_limit_total, usage_limit_per_customer, audience, audience_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [id, ...vals, now, now]);
      }
      if (input.audience === "selected" && input.customerIds) {
        await tx.run("DELETE FROM customer_offers WHERE offer_id = ?", [id]);
        for (const cid of new Set(input.customerIds)) await tx.run("INSERT INTO customer_offers (offer_id, customer_id, assigned_at) VALUES (?,?,?)", [id, cid, now]);
      }
      await audit(tx, this.ctx, "offer", id, input.id ? "update" : "create");
    });
    return id;
  }

  async assignedCustomerIds(offerId: string): Promise<string[]> {
    return (await this.ctx.db.all<{ customer_id: string }>("SELECT customer_id FROM customer_offers WHERE offer_id = ?", [offerId])).map((r) => r.customer_id);
  }

  async archiveOffer(id: string): Promise<void> {
    this.ctx.assertWritable();
    await this.ctx.db.transaction(async (tx) => {
      await tx.run("UPDATE offers SET archived_at=?, active=0 WHERE id=?", [this.ctx.now().toISOString(), id]);
      await audit(tx, this.ctx, "offer", id, "archive");
    });
  }

  async offerUsage(offerId: string): Promise<{ total: number; perCustomer: Map<string, number> }> {
    const rows = await this.ctx.db.all<{ customer_id: string; n: number }>("SELECT customer_id, COUNT(*) AS n FROM offer_redemptions WHERE offer_id = ? AND status='redeemed' GROUP BY customer_id", [offerId]);
    return { total: rows.reduce((a, r) => a + Number(r.n), 0), perCustomer: new Map(rows.map((r) => [r.customer_id, Number(r.n)])) };
  }

  /** Is the offer usable by this customer right now? Audience key matching for segments is supplied by the caller. */
  async checkOfferForCustomer(offerId: string, customerId: string, segmentAudienceOk: boolean, db: Db = this.ctx.db): Promise<void> {
    const row = await db.get<Record<string, unknown>>("SELECT * FROM offers WHERE id = ?", [offerId]);
    if (!row) throw new DomainError("not_found");
    const o = toOffer(row);
    const state = LoyaltyService.offerState(o, localDate(this.ctx.now()));
    if (state !== "live") throw new DomainError(state === "expired" ? "offer_expired" : "offer_disabled");
    if (o.audience === "selected") {
      const a = await db.get("SELECT 1 AS x FROM customer_offers WHERE offer_id=? AND customer_id=?", [offerId, customerId]);
      if (!a) throw new DomainError("offer_not_eligible");
    } else if (o.audience === "segment" && !segmentAudienceOk) {
      throw new DomainError("offer_not_eligible");
    }
    const tot = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM offer_redemptions WHERE offer_id=? AND status='redeemed'", [offerId]);
    if (o.usageLimitTotal != null && Number(tot!.n) >= o.usageLimitTotal) throw new DomainError("offer_limit_reached");
    const per = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM offer_redemptions WHERE offer_id=? AND customer_id=? AND status='redeemed'", [offerId, customerId]);
    if (o.usageLimitPerCustomer != null && Number(per!.n) >= o.usageLimitPerCustomer) throw new DomainError("offer_limit_reached");
  }

  /** Hook set by the facade so offers with a segment audience can be evaluated against live insights. */
  audienceMatcher: (customerId: string, key: string) => Promise<boolean> = async () => false;

  /** Segment audiences need live insights (separate DB reads), so resolve them before opening the transaction. */
  private async segmentAudienceOk(offerId: string, customerId: string): Promise<boolean> {
    const row = await this.ctx.db.get<{ audience: string; audience_key: string | null }>("SELECT audience, audience_key FROM offers WHERE id = ?", [offerId]);
    if (!row || row.audience !== "segment" || !row.audience_key) return true;
    return this.audienceMatcher(customerId, row.audience_key);
  }

  private async redeemOfferInTx(tx: Db, offerId: string, customerId: string, transactionId: string | null, segmentOk: boolean) {
    await this.checkOfferForCustomer(offerId, customerId, segmentOk, tx);
    const id = uuid();
    await tx.run("INSERT INTO offer_redemptions (id, offer_id, customer_id, transaction_id, status, redeemed_at) VALUES (?,?,?,?, 'redeemed', ?)", [id, offerId, customerId, transactionId, this.ctx.now().toISOString()]);
    await audit(tx, this.ctx, "offer", offerId, "redeem", { customerId, transactionId });
  }

  async redeemOffer(offerId: string, customerId: string, note?: string): Promise<void> {
    this.ctx.assertWritable();
    void note;
    const segmentOk = await this.segmentAudienceOk(offerId, customerId);
    await this.ctx.db.transaction(async (tx) => {
      await this.requireCustomer(tx, customerId);
      await this.redeemOfferInTx(tx, offerId, customerId, null, segmentOk);
    });
  }

  async offerRedemptionCounts(): Promise<Map<string, number>> {
    const rows = await this.ctx.db.all<{ offer_id: string; n: number }>("SELECT offer_id, COUNT(*) AS n FROM offer_redemptions WHERE status='redeemed' GROUP BY offer_id");
    return new Map(rows.map((r) => [r.offer_id, Number(r.n)]));
  }

  /** Used by CSV import (inside the import transaction): opening points and one summary visit, without fabricating a purchase history. */
  async importOpening(tx: Db, input: { customerId: string; points: number; lastVisitOn: string | null; totalSpentMinor: number }): Promise<void> {
    if (input.points > 0) await this.addLedger(tx, { customerId: input.customerId, delta: input.points, kind: "adjust", reason: "Opening balance (import)" });
    if (input.lastVisitOn) {
      const [y, m, d] = input.lastVisitOn.split("-").map(Number) as [number, number, number];
      await tx.run(
        "INSERT INTO transactions (id, customer_id, amount_minor, occurred_at, note, source, points_earned, status, created_at) VALUES (?,?,?,?,?,'import',0,'active',?)",
        [uuid(), input.customerId, input.totalSpentMinor, new Date(y, m - 1, d, 12).toISOString(), "Imported summary", this.ctx.now().toISOString()],
      );
    }
  }

  // ───────────────────────── reconciliation ─────────────────────────
  /** Verify the ledger is consistent with transactions and redemptions. Returns a list of problems (empty = healthy). */
  async reconcile(): Promise<{ code: string; customerId?: string; detail: string }[]> {
    const problems: { code: string; customerId?: string; detail: string }[] = [];
    const db = this.ctx.db;
    const earn = await db.all<{ customer_id: string; id: string; pe: number; l: number | null; st: string }>(
      `SELECT t.customer_id, t.id, t.points_earned AS pe, t.status AS st,
        (SELECT SUM(delta) FROM points_ledger WHERE kind='earn' AND ref_type='transaction' AND ref_id=t.id) AS l
       FROM transactions t WHERE t.points_earned > 0`);
    for (const r of earn) if (Number(r.l ?? 0) !== r.pe) problems.push({ code: "earn_mismatch", customerId: r.customer_id, detail: `transaction ${r.id}: ledger ${r.l ?? 0} vs ${r.pe}` });
    const rev = await db.all<{ id: string; customer_id: string; pe: number; st: string; r: number | null }>(
      `SELECT t.id, t.customer_id, t.points_earned AS pe, t.status AS st,
        (SELECT SUM(delta) FROM points_ledger WHERE kind='reversal' AND ref_type='transaction' AND ref_id=t.id) AS r
       FROM transactions t WHERE t.points_earned > 0`);
    for (const r of rev) {
      const expected = r.st === "reversed" ? -r.pe : 0;
      if (Number(r.r ?? 0) !== expected) problems.push({ code: "reversal_mismatch", customerId: r.customer_id, detail: `transaction ${r.id}` });
    }
    const red = await db.all<{ id: string; customer_id: string; cost: number; st: string; net: number | null }>(
      `SELECT r.id, r.customer_id, r.points_cost AS cost, r.status AS st,
        (SELECT SUM(delta) FROM points_ledger WHERE ref_type='redemption' AND ref_id=r.id) AS net
       FROM reward_redemptions r`);
    for (const r of red) {
      const expected = r.st === "redeemed" ? -r.cost : 0;
      if (Number(r.net ?? 0) !== expected) problems.push({ code: "redemption_mismatch", customerId: r.customer_id, detail: `redemption ${r.id}` });
    }
    return problems;
  }
}

// ───────────────────────── row mappers ─────────────────────────
function toLedger(r: Record<string, unknown>): LedgerEntry {
  return { id: r.id as string, customerId: r.customer_id as string, delta: Number(r.delta), kind: r.kind as LedgerKind, refType: (r.ref_type as string) ?? null, refId: (r.ref_id as string) ?? null, reason: (r.reason as string) ?? null, reversesEntryId: (r.reverses_entry_id as string) ?? null, createdAt: r.created_at as string };
}
function toTx(r: Record<string, unknown>): TransactionRow {
  return { id: r.id as string, customerId: r.customer_id as string, amountMinor: Number(r.amount_minor), occurredAt: iso(r.occurred_at as string), note: (r.note as string) ?? null, source: r.source as "manual" | "import", pointsEarned: Number(r.points_earned), status: r.status as "active" | "reversed", reversedAt: (r.reversed_at as string) ?? null, reversalReason: (r.reversal_reason as string) ?? null, createdAt: r.created_at as string };
}
function toReward(r: Record<string, unknown>): Reward {
  return { id: r.id as string, name: r.name as string, description: (r.description as string) ?? null, pointsCost: Number(r.points_cost), active: !!r.active, expiresAt: (r.expires_at as string) ?? null, archivedAt: (r.archived_at as string) ?? null };
}
function toRedemption(r: Record<string, unknown>): Redemption {
  return { id: r.id as string, customerId: r.customer_id as string, rewardId: r.reward_id as string, rewardName: r.reward_name as string, pointsCost: Number(r.points_cost), status: r.status as "redeemed" | "cancelled", redeemedAt: r.redeemed_at as string, cancelledAt: (r.cancelled_at as string) ?? null, cancelReason: (r.cancel_reason as string) ?? null, note: (r.note as string) ?? null };
}
function toTier(r: Record<string, unknown>): VipTier {
  return { id: r.id as string, name: r.name as string, minSpendMinor: Number(r.min_spend_minor), minVisits: Number(r.min_visits), earnMultiplierPct: Number(r.earn_multiplier_pct), benefits: (r.benefits as string) ?? null, sortOrder: Number(r.sort_order), active: !!r.active };
}
function toOffer(r: Record<string, unknown>): Offer {
  return { id: r.id as string, name: r.name as string, description: (r.description as string) ?? null, startsOn: r.starts_on as string, endsOn: (r.ends_on as string) ?? null, active: !!r.active, usageLimitTotal: r.usage_limit_total == null ? null : Number(r.usage_limit_total), usageLimitPerCustomer: r.usage_limit_per_customer == null ? null : Number(r.usage_limit_per_customer), audience: r.audience as AudienceType, audienceKey: (r.audience_key as string) ?? null, archivedAt: (r.archived_at as string) ?? null };
}
