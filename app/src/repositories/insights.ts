import type { AppContext } from "./context";
import type { SettingsRepo } from "./settings";
import { computeInsight, CustomerFacts, CustomerInsight } from "../domain/scoring";
import { LoyaltyService } from "./loyalty";
import { localDate } from "../domain/dates";

/** Loads facts for every customer in a handful of queries and derives scoring insights. */
export class InsightsService {
  constructor(private readonly ctx: AppContext, private readonly settings: SettingsRepo, private readonly loyalty: LoyaltyService) {}

  async loadAll(opts: { onlyId?: string; includeArchived?: boolean } = {}): Promise<CustomerInsight[]> {
    const db = this.ctx.db;
    const now = this.ctx.now();
    const [scoring, rewards, tiers] = await Promise.all([this.settings.get("scoring"), this.loyalty.rewards(), this.loyalty.tiers()]);
    const idFilter = opts.onlyId ? " AND c.id = ?" : "";
    const p = opts.onlyId ? [opts.onlyId] : [];
    const archivedFilter = opts.includeArchived || opts.onlyId ? "1=1" : "c.archived_at IS NULL";
    const customers = await db.all<{ id: string; name: string; created_at: string; birthday: string | null; consent_status: string; phone_norm: string | null; email: string | null }>(
      `SELECT c.id, c.name, c.created_at, c.birthday, c.consent_status, c.phone_norm, c.email FROM customers c WHERE ${archivedFilter}${idFilter}`, p);
    if (!customers.length) return [];
    const scope = opts.onlyId ? " AND customer_id = ?" : "";
    const purchases = await db.all<{ customer_id: string; occurred_at: string; amount_minor: number }>(
      `SELECT customer_id, occurred_at, amount_minor FROM transactions WHERE status='active'${scope}`, p);
    const balances = opts.onlyId ? new Map([[opts.onlyId, await this.loyalty.balance(opts.onlyId)]]) : await this.loyalty.balances();
    const tagRows = await db.all<{ customer_id: string; name: string }>(
      `SELECT ct.customer_id, t.name FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id${opts.onlyId ? " WHERE ct.customer_id = ?" : ""}`, p);
    const contacts = await db.all<{ customer_id: string; last: string | null }>(
      `SELECT customer_id, MAX(COALESCE(contacted_at, prepared_at)) AS last FROM customer_action_status WHERE (prepared_at IS NOT NULL OR contacted_at IS NOT NULL)${scope} GROUP BY customer_id`, p);
    const follow = await db.all<{ customer_id: string; due: string }>(
      `SELECT customer_id, MIN(due_on) AS due FROM follow_ups WHERE status='open'${scope} GROUP BY customer_id`, p);

    const byC = <T extends { customer_id: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) (m.get(r.customer_id) ?? m.set(r.customer_id, []).get(r.customer_id)!).push(r);
      return m;
    };
    const pByC = byC(purchases);
    const tagsByC = byC(tagRows);
    const contactBy = new Map(contacts.map((c) => [c.customer_id, c.last]));
    const followBy = new Map(follow.map((f) => [f.customer_id, f.due]));
    const redeemable = rewards.filter((r) => LoyaltyService.isRewardRedeemable(r, now));

    return customers.map((c) => {
      const ps = pByC.get(c.id) ?? [];
      const balance = balances.get(c.id) ?? 0;
      const spend = ps.reduce((a, r) => a + Number(r.amount_minor), 0);
      const visitCount = new Set(ps.map((r) => localDate(r.occurred_at))).size;
      const tier = LoyaltyService.tierFor({ visitCount, spendMinor: spend }, tiers);
      const facts: CustomerFacts = {
        id: c.id, name: c.name, createdAt: c.created_at, birthday: c.birthday, consent: c.consent_status as CustomerFacts["consent"],
        hasPhone: !!c.phone_norm, tags: (tagsByC.get(c.id) ?? []).map((t) => t.name),
        purchaseAts: ps.map((r) => r.occurred_at), spendMinor: spend, pointsBalance: balance,
        tierId: tier?.id ?? null, tierName: tier?.name ?? null, lastContactAt: contactBy.get(c.id) ?? null, nextFollowUpOn: followBy.get(c.id) ?? null,
        affordableRewards: redeemable.filter((r) => r.pointsCost <= balance).map((r) => ({ id: r.id, name: r.name, cost: r.pointsCost })),
      };
      return computeInsight(facts, scoring, now);
    });
  }

  async loadOne(id: string): Promise<CustomerInsight | null> {
    return (await this.loadAll({ onlyId: id }))[0] ?? null;
  }
}
