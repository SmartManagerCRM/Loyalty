import type { AppContext } from "./context";
import type { InsightsService } from "./insights";
import type { LoyaltyService } from "./loyalty";
import { addDays, dayDiff, endOfLocalDayIso, localDate, startOfLocalDayIso } from "../domain/dates";
import { toCsv } from "../domain/csv";
import type { ActionType, Band } from "../domain/types";

export interface DateRange {
  from: string; // local YYYY-MM-DD inclusive
  to: string; // local YYYY-MM-DD inclusive
}

export interface Bucket {
  key: string; // bucket start date
  purchases: number;
  revenueMinor: number;
  newCustomers: number;
}

export interface ReportData {
  range: DateRange;
  granularity: "day" | "week" | "month";
  customers: { newInRange: number; totalAtEnd: number; purchasing: number };
  purchases: { count: number; revenueMinor: number; averageMinor: number; buckets: Bucket[] };
  repeat: { customersWithPurchase: number; repeatCustomers: number; repeatRatePct: number | null; newBuyers: number; returningBuyers: number };
  points: { earned: number; redeemed: number; adjustedNet: number; reversed: number; outstandingNow: number };
  rewards: { redemptions: number; cancelled: number; pointsRedeemed: number; byReward: { name: string; count: number; points: number }[] };
  actions: { runs: number; byType: { type: ActionType; total: number; prepared: number; contacted: number; replied: number; returned: number; notInterested: number; purchasedAfter: number }[] };
  followUps: { created: number; done: number; dismissed: number; openOverdueNow: number; openNow: number };
  snapshot: { tiers: { name: string; count: number }[]; bands: { band: Band; count: number }[] };
  offers: { created: number; redeemed: number; byOffer: { name: string; count: number }[] };
}

export class ReportsService {
  constructor(private readonly ctx: AppContext, private readonly insights: InsightsService, private readonly loyalty: LoyaltyService) {}

  static granularity(r: DateRange): "day" | "week" | "month" {
    const days = dayDiff(r.from, r.to) + 1;
    return days <= 31 ? "day" : days <= 190 ? "week" : "month";
  }

  private bucketKey(ymd: string, g: "day" | "week" | "month"): string {
    if (g === "day") return ymd;
    if (g === "month") return ymd.slice(0, 7) + "-01";
    const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    return addDays(ymd, -wd);
  }

  async build(range: DateRange): Promise<ReportData> {
    const db = this.ctx.db;
    const g = ReportsService.granularity(range);
    const fromIso = startOfLocalDayIso(range.from);
    const toIso = endOfLocalDayIso(range.to);
    const today = localDate(this.ctx.now());

    // buckets skeleton
    const buckets = new Map<string, Bucket>();
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      const k = this.bucketKey(d, g);
      if (!buckets.has(k)) buckets.set(k, { key: k, purchases: 0, revenueMinor: 0, newCustomers: 0 });
    }

    const purchases = await db.all<{ customer_id: string; occurred_at: string; amount_minor: number }>(
      "SELECT customer_id, occurred_at, amount_minor FROM transactions WHERE status='active' AND occurred_at >= ? AND occurred_at <= ?", [fromIso, toIso]);
    let revenue = 0;
    const perCustomerDays = new Map<string, Set<string>>();
    for (const p of purchases) {
      const day = localDate(p.occurred_at);
      const b = buckets.get(this.bucketKey(day, g));
      if (b) { b.purchases++; b.revenueMinor += Number(p.amount_minor); }
      revenue += Number(p.amount_minor);
      (perCustomerDays.get(p.customer_id) ?? perCustomerDays.set(p.customer_id, new Set()).get(p.customer_id)!).add(day);
    }
    const created = await db.all<{ created_at: string }>("SELECT created_at FROM customers WHERE created_at >= ? AND created_at <= ?", [fromIso, toIso]);
    for (const c of created) {
      const b = buckets.get(this.bucketKey(localDate(c.created_at), g));
      if (b) b.newCustomers++;
    }
    const totalAtEnd = (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE created_at <= ?", [toIso]))!.n;

    const buyers = [...perCustomerDays.keys()];
    const repeatCustomers = [...perCustomerDays.values()].filter((s) => s.size >= 2).length;
    let newBuyers = 0;
    if (buyers.length) {
      const before = await db.all<{ customer_id: string }>("SELECT DISTINCT customer_id FROM transactions WHERE status='active' AND occurred_at < ?", [fromIso]);
      const hadBefore = new Set(before.map((b) => b.customer_id));
      newBuyers = buyers.filter((b) => !hadBefore.has(b)).length;
    }

    const pts = await db.get<Record<string, number | null>>(
      `SELECT SUM(CASE WHEN kind='earn' THEN delta ELSE 0 END) AS earned,
              SUM(CASE WHEN kind='redeem' THEN -delta ELSE 0 END) AS redeemed,
              SUM(CASE WHEN kind='adjust' THEN delta ELSE 0 END) AS adj,
              SUM(CASE WHEN kind='reversal' THEN -delta ELSE 0 END) AS rev
       FROM points_ledger WHERE created_at >= ? AND created_at <= ?`, [fromIso, toIso]);
    const outstanding = (await db.get<{ s: number | null }>("SELECT SUM(delta) AS s FROM points_ledger"))!.s ?? 0;

    const red = await db.all<{ reward_name: string; status: string; n: number; pts: number }>(
      "SELECT reward_name, status, COUNT(*) AS n, SUM(points_cost) AS pts FROM reward_redemptions WHERE redeemed_at >= ? AND redeemed_at <= ? GROUP BY reward_name, status", [fromIso, toIso]);
    const byReward = new Map<string, { name: string; count: number; points: number }>();
    let cancelled = 0;
    for (const r of red) {
      if (r.status === "cancelled") { cancelled += Number(r.n); continue; }
      const e = byReward.get(r.reward_name) ?? { name: r.reward_name, count: 0, points: 0 };
      e.count += Number(r.n); e.points += Number(r.pts);
      byReward.set(r.reward_name, e);
    }

    const act = await db.all<{ type: string; status: string; n: number }>(
      `SELECT a.type, s.status, COUNT(*) AS n FROM customer_action_status s JOIN smart_actions a ON a.id = s.smart_action_id
       WHERE a.created_at >= ? AND a.created_at <= ? GROUP BY a.type, s.status`, [fromIso, toIso]);
    const after = await db.all<{ type: string; n: number }>(
      `SELECT a.type, COUNT(*) AS n FROM customer_action_status s JOIN smart_actions a ON a.id = s.smart_action_id
       WHERE a.created_at >= ? AND a.created_at <= ? AND s.prepared_at IS NOT NULL AND EXISTS (
         SELECT 1 FROM transactions t WHERE t.customer_id = s.customer_id AND t.status='active' AND t.occurred_at > s.prepared_at
           AND julianday(t.occurred_at) - julianday(s.prepared_at) <= 30)
       GROUP BY a.type`, [fromIso, toIso]);
    const runCount = (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM smart_actions WHERE created_at >= ? AND created_at <= ?", [fromIso, toIso]))!.n;
    const types = new Map<string, ReportData["actions"]["byType"][number]>();
    for (const r of act) {
      const e = types.get(r.type) ?? { type: r.type as ActionType, total: 0, prepared: 0, contacted: 0, replied: 0, returned: 0, notInterested: 0, purchasedAfter: 0 };
      const n = Number(r.n);
      e.total += n;
      if (r.status === "prepared") e.prepared += n;
      else if (r.status === "contacted") e.contacted += n;
      else if (r.status === "replied") e.replied += n;
      else if (r.status === "returned") e.returned += n;
      else if (r.status === "not_interested") e.notInterested += n;
      types.set(r.type, e);
    }
    for (const a of after) { const e = types.get(a.type); if (e) e.purchasedAfter = Number(a.n); }

    const fu = await db.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM follow_ups WHERE created_at >= ? AND created_at <= ? GROUP BY status", [fromIso, toIso]);
    const fuNow = await db.get<{ open: number; overdue: number }>("SELECT SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status='open' AND due_on < ? THEN 1 ELSE 0 END) AS overdue FROM follow_ups", [today]);
    const fcount = (s: string) => Number(fu.find((x) => x.status === s)?.n ?? 0);
    const completedInRange = (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM follow_ups WHERE status='done' AND completed_at >= ? AND completed_at <= ?", [fromIso, toIso]))!.n;

    const ins = await this.insights.loadAll();
    const tiers = await this.loyalty.tiers();
    const bandOrder: Band[] = ["new", "active", "at_risk", "inactive", "no_purchases"];

    const offersCreated = (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM offers WHERE created_at >= ? AND created_at <= ?", [fromIso, toIso]))!.n;
    const offerRed = await db.all<{ name: string; n: number }>(
      `SELECT o.name, COUNT(*) AS n FROM offer_redemptions r JOIN offers o ON o.id = r.offer_id WHERE r.status='redeemed' AND r.redeemed_at >= ? AND r.redeemed_at <= ? GROUP BY o.name`, [fromIso, toIso]);

    return {
      range, granularity: g,
      customers: { newInRange: created.length, totalAtEnd: Number(totalAtEnd), purchasing: buyers.length },
      purchases: { count: purchases.length, revenueMinor: revenue, averageMinor: purchases.length ? Math.round(revenue / purchases.length) : 0, buckets: [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)) },
      repeat: { customersWithPurchase: buyers.length, repeatCustomers, repeatRatePct: buyers.length ? Math.round((repeatCustomers * 100) / buyers.length) : null, newBuyers, returningBuyers: buyers.length - newBuyers },
      points: { earned: Number(pts?.earned ?? 0), redeemed: Number(pts?.redeemed ?? 0), adjustedNet: Number(pts?.adj ?? 0), reversed: Number(pts?.rev ?? 0), outstandingNow: Number(outstanding) },
      rewards: { redemptions: [...byReward.values()].reduce((a, r) => a + r.count, 0), cancelled, pointsRedeemed: [...byReward.values()].reduce((a, r) => a + r.points, 0), byReward: [...byReward.values()].sort((a, b) => b.count - a.count) },
      actions: { runs: Number(runCount), byType: [...types.values()] },
      followUps: { created: fcount("open") + fcount("done") + fcount("dismissed"), done: Number(completedInRange), dismissed: fcount("dismissed"), openOverdueNow: Number(fuNow?.overdue ?? 0), openNow: Number(fuNow?.open ?? 0) },
      snapshot: {
        tiers: tiers.map((t) => ({ name: t.name, count: ins.filter((i) => i.tierId === t.id).length })),
        bands: bandOrder.map((band) => ({ band, count: ins.filter((i) => i.band === band).length })),
      },
      offers: { created: Number(offersCreated), redeemed: offerRed.reduce((a, o) => a + Number(o.n), 0), byOffer: offerRed.map((o) => ({ name: o.name, count: Number(o.n) })) },
    };
  }

  toCsv(r: ReportData, minorDecimals: number): string {
    const money = (m: number) => (m / 10 ** minorDecimals).toFixed(minorDecimals);
    return toCsv(["section", "metric", "value"], [
      ["range", "from", r.range.from], ["range", "to", r.range.to],
      ["customers", "new", r.customers.newInRange], ["customers", "total_at_end", r.customers.totalAtEnd], ["customers", "purchasing", r.customers.purchasing],
      ["purchases", "count", r.purchases.count], ["purchases", "revenue", money(r.purchases.revenueMinor)], ["purchases", "average", money(r.purchases.averageMinor)],
      ["repeat", "repeat_customers", r.repeat.repeatCustomers], ["repeat", "repeat_rate_pct", r.repeat.repeatRatePct ?? ""],
      ["points", "earned", r.points.earned], ["points", "redeemed", r.points.redeemed], ["points", "adjusted_net", r.points.adjustedNet], ["points", "outstanding_now", r.points.outstandingNow],
      ["rewards", "redemptions", r.rewards.redemptions], ["rewards", "cancelled", r.rewards.cancelled],
      ...r.rewards.byReward.map((x) => ["reward", x.name, x.count]),
      ["actions", "runs", r.actions.runs],
      ...r.actions.byType.flatMap((t) => [[`action:${t.type}`, "customers", t.total], [`action:${t.type}`, "contacted", t.contacted], [`action:${t.type}`, "replied", t.replied], [`action:${t.type}`, "returned", t.returned], [`action:${t.type}`, "purchased_after_outreach", t.purchasedAfter]]),
      ["follow_ups", "created", r.followUps.created], ["follow_ups", "done", r.followUps.done], ["follow_ups", "overdue_now", r.followUps.openOverdueNow],
      ...r.snapshot.tiers.map((t) => ["vip_tier_now", t.name, t.count]), ...r.snapshot.bands.map((b) => ["segment_now", b.band, b.count]),
      ["offers", "created", r.offers.created], ["offers", "redeemed", r.offers.redeemed],
      ...r.purchases.buckets.map((b) => [`${r.granularity}:${b.key}`, "purchases|revenue|new_customers", `${b.purchases}|${money(b.revenueMinor)}|${b.newCustomers}`]),
    ]);
  }
}
