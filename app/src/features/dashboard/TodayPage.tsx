import { Link } from "react-router-dom";
import { Bell, Cake, Crown, Gift, Heart, HeartHandshake, Plus, RefreshCw, ShieldAlert, Target, Upload, UserPlus, UserRoundX, Users, Sparkles, Save } from "lucide-react";
import { useState } from "react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Banner, BarChart, Button, Card, Empty, LinkButton, Spinner, Stat, Chevron } from "../../components/ui";
import { LogoMark } from "../../components/Logo";
import type { Recommendation } from "../../repositories/dashboard";
import { CustomerPicker, PurchaseSheet } from "../customers/sheets";
import { addDays, localDate } from "../../domain/dates";

const ICONS: Record<string, typeof Bell> = {
  followUpsDue: Bell, retain_vip: Crown, win_back: UserRoundX, prevent_churn: ShieldAlert, points_reminder: Gift, new_customer: HeartHandshake,
  birthday: Cake, addFirstCustomers: UserPlus, backupNever: Save, backupOld: Save,
};

function RecCard({ r }: { r: Recommendation }) {
  const { t, reason } = useApp();
  const Icon = ICONS[r.key] ?? Sparkles;
  const first = r.examples[0];
  return (
    <Link to={r.route} className={`card link`} style={{ borderInlineStart: `4px solid ${r.tone === "urgent" ? "var(--danger)" : r.tone === "normal" ? "var(--warn)" : "var(--brand)"}` }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Icon color="var(--brand-deep)" style={{ flex: "none", marginTop: 2 }} />
        <div className="grow stack" style={{ gap: 4 }}>
          <div className="strong">{t(`rec.${r.key}.title`, r.params)}</div>
          <div className="small muted">{t(`rec.${r.key}.text`, r.params)}</div>
          {first ? (
            <div className="small" style={{ marginTop: 2 }}>
              <span className="strong">{first.name}</span>
              {first.reasons[0] ? <span className="muted"> — {reason(first.reasons[0])}</span> : null}
              {r.count > 1 ? <span className="muted"> · {t("today.andMore", { count: r.count - 1 })}</span> : null}
            </div>
          ) : null}
        </div>
        <Chevron />
      </div>
    </Link>
  );
}

export function TodayPage() {
  const { svc, settings, t, money, num, canWrite } = useApp();
  const { data, loading, error } = useData(async () => {
    const today = localDate(new Date());
    const [dash, rep] = await Promise.all([svc.dashboard.load(), svc.reports.build({ from: addDays(today, -29), to: today })]);
    return { dash, rep };
  }, []);
  const [picker, setPicker] = useState(false);
  const [buyFor, setBuyFor] = useState<string | null>(null);
  const d = data?.dash;
  const attention = d ? d.totals.atRisk + d.totals.winBack + d.followUpsDue + d.rewardsReady : 0;

  return (
    <Page title="" root actions={<Button sm variant="primary" write onClick={() => setPicker(true)}><Plus />{t("today.recordPurchase")}</Button>}>
      <div className="stack-lg">
        <div className="brandbar"><LogoMark /><div><b>{settings.business.name || t("app.name")}</b><small>LOYALTY</small></div></div>
        <div className="greet"><h2>{t("today.greeting")}</h2><p className="muted small">{t("today.greetingSub")}</p></div>
        {loading ? <Spinner /> : null}
        {error ? <Banner tone="danger">{t("err.unexpected")}</Banner> : null}
        {d ? (
          <>
            {d.totals.customers === 0 ? (
              <Card><Empty icon={<UserPlus />} title={t("today.emptyTitle")} text={t("today.emptyText")} action={<div className="row wrap" style={{ justifyContent: "center" }}><LinkButton to="/customers/new" variant="primary">{t("customers.add")}</LinkButton><LinkButton to="/customers/import"><Upload />{t("customers.import")}</LinkButton></div>} /></Card>
            ) : (
              <div className="grid2">
                <Link to="/customers" className="tile green"><span className="ico"><Users /></span><div><div className="v num">{num(d.totals.customers)}</div><div className="l">{t("today.totalCustomers")}</div><div className="go">{t("today.active")}: {num(d.totals.active)}</div></div></Link>
                <Link to="/actions/points_reminder" className="tile orange"><span className="ico"><Gift /></span><div><div className="v num">{num(d.rewardsReady)}</div><div className="l">{t("today.rewardsTile")}</div><div className="go">{t("today.viewCustomers")} ›</div></div></Link>
                <Link to="/actions/prevent_churn" className="tile red"><span className="ico"><Heart /></span><div><div className="v num">{num(d.totals.atRisk)}</div><div className="l">{t("today.atRisk")}</div><div className="go">{t("today.checkNow")} ›</div></div></Link>
                <Link to="/actions/win_back" className="tile blue"><span className="ico"><RefreshCw /></span><div><div className="v num">{num(d.totals.winBack)}</div><div className="l">{t("today.winBack")}</div><div className="go">{t("today.winThem")} ›</div></div></Link>
              </div>
            )}

            {d.recommendations.length ? (
              <section className="stack" aria-label={t("today.recommended")}>
                <h2 className="section-title">{t("today.recommended")}</h2>
                {d.recommendations.map((r) => <RecCard key={r.id} r={r} />)}
              </section>
            ) : d.totals.customers > 0 ? <Banner tone="ok">{t("today.allClear")}</Banner> : null}

            {d.totals.customers > 0 && data ? (
              <>
                <Card>
                  <div className="stack">
                    <div className="row between"><h3>{t("today.salesVisits")}</h3><span className="badge">{t("today.thisMonth")}</span></div>
                    <div className="metric3">
                      <div><div className="v num" style={{ fontSize: "1.05rem" }}>{money(data.rep.purchases.revenueMinor)}</div><div className="small muted">{t("today.revenue")}</div></div>
                      <div><div className="v num">{num(data.rep.purchases.count)}</div><div className="small muted">{t("today.visits")}</div></div>
                      <div><div className="v num">{num(data.rep.repeat.repeatCustomers)}</div><div className="small muted">{t("today.repeat")}</div></div>
                    </div>
                    <BarChart ariaLabel={t("reports.chartLabel")} data={data.rep.purchases.buckets.map((b) => ({ label: b.key.slice(8), value: b.purchases }))} labelEvery={5} />
                  </div>
                </Card>
                <div className="grid3">
                  <Stat label={t("today.pointsEarned")} value={num(d.loyalty.earned30)} sub={t("today.last30")} />
                  <Stat label={t("today.pointsRedeemed")} value={num(d.loyalty.redeemed30)} sub={t("today.last30")} />
                  <Stat label={t("today.followUpsDue")} value={num(d.followUpsDue)} tone={d.followUpsDue ? "warn" : ""} to="/actions/followups" />
                </div>
                <Link to="/actions" className="banner-cta">
                  <span className="ico"><Target /></span>
                  <div className="grow"><div className="strong" style={{ fontSize: "1.1rem" }}>{t("nav.actions")}</div><div className="small" style={{ opacity: .85 }}>{attention ? t("today.smartBanner", { count: attention }) : t("today.noAttention")}</div></div>
                  <Chevron />
                </Link>
              </>
            ) : null}
            {!canWrite ? <p className="muted small">{t("license.readOnlyNote")}</p> : null}
          </>
        ) : null}
      </div>
      {picker ? <CustomerPicker onClose={() => setPicker(false)} onPick={(c) => { setPicker(false); setBuyFor(c.id); }} /> : null}
      {buyFor ? <PurchaseSheet customerId={buyFor} onClose={() => setBuyFor(null)} /> : null}
    </Page>
  );
}
