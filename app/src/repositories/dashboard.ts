import type { AppContext } from "./context";
import type { SettingsRepo } from "./settings";
import type { InsightsService } from "./insights";
import type { ActionsService } from "./actions";
import { ACTION_TYPES, ActionType, Reason } from "../domain/types";
import { addDays, dayDiff, localDate, startOfLocalDayIso } from "../domain/dates";
import type { CustomerInsight } from "../domain/scoring";

export interface Recommendation {
  id: string;
  /** i18n key under `rec.` */
  key: string;
  params: Record<string, string | number>;
  route: string;
  count: number;
  /** Up to 3 example customers with an explanation (translatable reasons) */
  examples: { customerId: string; name: string; reasons: Reason[] }[];
  tone: "urgent" | "normal" | "info";
}

export interface DashboardData {
  totals: { customers: number; active: number; atRisk: number; winBack: number; newCustomers: number; withoutPurchases: number };
  rewardsReady: number;
  followUpsDue: number;
  recent: { days: number; purchases: number; revenueMinor: number; newCustomers: number };
  loyalty: { earned30: number; redeemed30: number; outstanding: number; redemptions30: number };
  recommendations: Recommendation[];
}

const ROUTE: Record<ActionType, string> = {
  win_back: "/actions/win_back", prevent_churn: "/actions/prevent_churn", retain_vip: "/actions/retain_vip", new_customer: "/actions/new_customer",
  birthday: "/actions/birthday", points_reminder: "/actions/points_reminder", custom: "/actions/custom",
};

export class DashboardService {
  constructor(private readonly ctx: AppContext, private readonly settings: SettingsRepo, private readonly insights: InsightsService, private readonly actions: ActionsService) {}

  async load(): Promise<DashboardData> {
    const db = this.ctx.db;
    const now = this.ctx.now();
    const today = localDate(now);
    const all: CustomerInsight[] = await this.insights.loadAll();
    const count = (f: (i: CustomerInsight) => boolean) => all.filter(f).length;

    const since7 = startOfLocalDayIso(addDays(today, -6));
    const since30 = startOfLocalDayIso(addDays(today, -29));
    const rec = await db.get<{ n: number; rev: number | null }>("SELECT COUNT(*) AS n, SUM(amount_minor) AS rev FROM transactions WHERE status='active' AND occurred_at >= ?", [since7]);
    const newC = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE archived_at IS NULL AND created_at >= ?", [since7]);
    const led = await db.get<{ earned: number | null; redeemed: number | null; outstanding: number | null }>(
      `SELECT SUM(CASE WHEN created_at >= ? AND kind IN ('earn') THEN delta ELSE 0 END) AS earned,
              SUM(CASE WHEN created_at >= ? AND kind = 'redeem' THEN -delta ELSE 0 END) AS redeemed,
              SUM(delta) AS outstanding FROM points_ledger`, [since30, since30]);
    const redemptions30 = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM reward_redemptions WHERE status='redeemed' AND redeemed_at >= ?", [since30]);
    const dueFollow = await this.actions.followUps({ status: "open" });
    const due = dueFollow.filter((f) => f.dueOn <= today);

    const data: DashboardData = {
      totals: {
        customers: all.length,
        active: count((i) => i.band === "active" || i.band === "new"),
        atRisk: count((i) => i.band === "at_risk"),
        winBack: count((i) => i.band === "inactive"),
        newCustomers: count((i) => i.band === "new"),
        withoutPurchases: count((i) => i.band === "no_purchases"),
      },
      rewardsReady: count((i) => i.rewardReady),
      followUpsDue: due.length,
      recent: { days: 7, purchases: Number(rec?.n ?? 0), revenueMinor: Number(rec?.rev ?? 0), newCustomers: Number(newC?.n ?? 0) },
      loyalty: { earned30: Number(led?.earned ?? 0), redeemed30: Number(led?.redeemed ?? 0), outstanding: Number(led?.outstanding ?? 0), redemptions30: Number(redemptions30?.n ?? 0) },
      recommendations: [],
    };

    const recs: Recommendation[] = [];
    if (all.length === 0) {
      recs.push({ id: "first-customers", key: "addFirstCustomers", params: {}, route: "/customers/import", count: 0, examples: [], tone: "info" });
    }
    if (due.length) {
      recs.push({
        id: "followups", key: "followUpsDue", params: { count: due.length }, route: "/actions/followups", count: due.length, tone: "urgent",
        examples: due.slice(0, 3).map((f) => ({ customerId: f.customerId, name: f.customerName, reasons: [{ key: "followUpOverdue", params: { days: Math.max(0, dayDiff(f.dueOn, today)) } }] })),
      });
    }
    const typeOrder: ActionType[] = ["retain_vip", "win_back", "prevent_churn", "points_reminder", "new_customer", "birthday"];
    for (const type of typeOrder) {
      const rows = (await this.actions.eligible(type, { insights: all })).filter((r) => !r.candidate.blocked);
      if (!rows.length) continue;
      recs.push({
        id: type, key: type, params: { count: rows.length }, route: ROUTE[type], count: rows.length,
        tone: type === "retain_vip" || type === "win_back" ? "urgent" : type === "birthday" || type === "points_reminder" ? "info" : "normal",
        examples: rows.slice(0, 3).map((r) => ({ customerId: r.insight.id, name: r.insight.name, reasons: r.candidate.reasons })),
      });
    }
    const settings = await this.settings.all();
    if (all.length > 0) {
      const last = settings.lastBackupAt;
      const days = last ? dayDiff(localDate(last), today) : null;
      if (days === null || days >= settings.backupReminderDays) {
        recs.push({ id: "backup", key: days === null ? "backupNever" : "backupOld", params: { days: days ?? 0 }, route: "/settings/backup", count: 0, examples: [], tone: "info" });
      }
    }
    data.recommendations = recs;
    return data;
  }

  static actionTypes = ACTION_TYPES;
}
