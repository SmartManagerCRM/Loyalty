import type { Db } from "../database/db";
import { migrate } from "../database/migrations";
import { AppContext, makeContext } from "./context";
import { SettingsRepo } from "./settings";
import { CustomersRepo } from "./customers";
import { LoyaltyService } from "./loyalty";
import { InsightsService } from "./insights";
import { ActionsService } from "./actions";
import { DashboardService } from "./dashboard";
import { ReportsService } from "./reports";
import { BackupService } from "./backup";
import { ImportExportService } from "./importExport";
import { matchesSegment } from "../domain/scoring";
import { SettingsMap } from "../domain/settings";
import { DomainError } from "../database/db";
import { audit, uuid } from "./context";
import type { BandAudience } from "./types";

export interface Services {
  ctx: AppContext;
  settings: SettingsRepo;
  customers: CustomersRepo;
  loyalty: LoyaltyService;
  insights: InsightsService;
  actions: ActionsService;
  dashboard: DashboardService;
  reports: ReportsService;
  backup: BackupService;
  io: ImportExportService;
  /** Complete first-run setup in one transaction (settings + default templates + a starter VIP tier). */
  completeSetup(input: Pick<SettingsMap, "business" | "locale" | "currency" | "earnRule">): Promise<void>;
  isSetupComplete(): Promise<boolean>;
}

export async function createServices(db: Db, opts: Partial<Pick<AppContext, "assertWritable" | "now">> = {}): Promise<Services> {
  await migrate(db);
  const ctx = makeContext(db, opts);
  const settings = new SettingsRepo(ctx);
  const customers = new CustomersRepo(ctx, settings);
  const loyalty = new LoyaltyService(ctx, settings);
  const insights = new InsightsService(ctx, settings, loyalty);
  const actions = new ActionsService(ctx, settings, insights);
  const dashboard = new DashboardService(ctx, settings, insights, actions);
  const reports = new ReportsService(ctx, insights, loyalty);
  const backup = new BackupService(ctx, settings);
  const io = new ImportExportService(ctx, settings, customers, loyalty);

  // Offers aimed at a segment ("band:at_risk", "tier:<id>", "segment:<id>") are matched against live insights.
  loyalty.audienceMatcher = async (customerId, key) => {
    const i = await insights.loadOne(customerId);
    if (!i) return false;
    const [kind, value] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)] as [string, string];
    if (kind === "band") return i.band === (value as BandAudience);
    if (kind === "tier") return value === "any" ? i.isVip : i.tierId === value;
    if (kind === "segment") {
      const seg = await actions.segment(value);
      return !!seg && matchesSegment(i, seg.rules);
    }
    return false;
  };

  return {
    ctx, settings, customers, loyalty, insights, actions, dashboard, reports, backup, io,
    async isSetupComplete() {
      return settings.get("setupComplete");
    },
    async completeSetup(input) {
      ctx.assertWritable();
      if (!input.business.name.trim()) throw new DomainError("name_required");
      await db.transaction(async (tx) => {
        const now = ctx.now().toISOString();
        const put = async (k: string, v: unknown) =>
          tx.run("INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [k, JSON.stringify(v), now]);
        await put("business", input.business);
        await put("locale", input.locale);
        await put("currency", input.currency);
        await put("earnRule", input.earnRule);
        await put("setupComplete", true);
        const tiers = await tx.get<{ n: number }>("SELECT COUNT(*) AS n FROM vip_tiers");
        if (Number(tiers!.n) === 0) {
          await tx.run("INSERT INTO vip_tiers (id, name, min_spend_minor, min_visits, earn_multiplier_pct, benefits, sort_order, active, created_at, updated_at) VALUES (?,?,0,10,100,NULL,1,1,?,?)", [uuid(), "VIP", now, now]);
        }
        await audit(tx, ctx, "settings", null, "setup_complete");
      });
      settings.invalidate();
      await actions.seedDefaultTemplates();
    },
  };
}
