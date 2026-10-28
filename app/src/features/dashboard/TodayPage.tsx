import { Link } from "react-router-dom";
import { Bell, Cake, Crown, Gift, HeartHandshake, Plus, ShieldAlert, Upload, UserPlus, UserRoundX, Sparkles, Save } from "lucide-react";
import { useState } from "react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Banner, Button, Card, Empty, LinkButton, Spinner, Stat, Chevron } from "../../components/ui";
import type { Recommendation } from "../../repositories/dashboard";
import { CustomerPicker, PurchaseSheet } from "../customers/sheets";
import { localDate } from "../../domain/dates";

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
  const { data, loading, error } = useData(() => svc.dashboard.load(), []);
  const [picker, setPicker] = useState(false);
  const [buyFor, setBuyFor] = useState<string | null>(null);
  const today = new Date().toLocaleDateString(settings.locale.language === "ar" ? "ar-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Page title={settings.business.name || t("app.name")} root actions={<Button sm variant="primary" write onClick={() => setPicker(true)}><Plus />{t("today.recordPurchase")}</Button>}>
      <div className="stack-lg">
        <p className="muted small">{today}</p>
        {loading ? <Spinner /> : null}
        {error ? <Banner tone="danger">{t("err.unexpected")}</Banner> : null}
        {data ? (
          <>
            {data.totals.customers === 0 ? (
              <Card><Empty icon={<UserPlus />} title={t("today.emptyTitle")} text={t("today.emptyText")} action={<div className="row wrap" style={{ justifyContent: "center" }}><LinkButton to="/customers/new" variant="primary">{t("customers.add")}</LinkButton><LinkButton to="/customers/import"><Upload />{t("customers.import")}</LinkButton></div>} /></Card>
            ) : (
              <div className="grid2 grid-auto">
                <Stat label={t("today.totalCustomers")} value={num(data.totals.customers)} to="/customers" />
                <Stat label={t("today.active")} value={num(data.totals.active)} tone="brand" to="/customers?band=active" />
                <Stat label={t("today.atRisk")} value={num(data.totals.atRisk)} tone="warn" to="/actions/prevent_churn" />
                <Stat label={t("today.winBack")} value={num(data.totals.winBack)} tone="danger" to="/actions/win_back" />
                <Stat label={t("today.rewardsReady")} value={num(data.rewardsReady)} tone="gold" to="/actions/points_reminder" />
                <Stat label={t("today.followUpsDue")} value={num(data.followUpsDue)} tone={data.followUpsDue ? "warn" : ""} to="/actions/followups" />
              </div>
            )}

            {data.recommendations.length ? (
              <section className="stack" aria-label={t("today.recommended")}>
                <h2 className="section-title">{t("today.recommended")}</h2>
                {data.recommendations.map((r) => <RecCard key={r.id} r={r} />)}
              </section>
            ) : data.totals.customers > 0 ? (
              <Banner tone="ok">{t("today.allClear")}</Banner>
            ) : null}

            {data.totals.customers > 0 ? (
              <>
                <section className="stack">
                  <h2 className="section-title">{t("today.recent", { days: data.recent.days })}</h2>
                  <div className="grid3">
                    <Stat label={t("today.purchases")} value={num(data.recent.purchases)} />
                    <Stat label={t("today.revenue")} value={<span style={{ fontSize: "1.05rem" }}>{money(data.recent.revenueMinor)}</span>} />
                    <Stat label={t("today.newCustomers")} value={num(data.recent.newCustomers)} />
                  </div>
                </section>
                <section className="stack">
                  <h2 className="section-title">{t("today.loyaltyActivity")}</h2>
                  <div className="grid3">
                    <Stat label={t("today.pointsEarned")} value={num(data.loyalty.earned30)} sub={t("today.last30")} />
                    <Stat label={t("today.pointsRedeemed")} value={num(data.loyalty.redeemed30)} sub={t("today.last30")} />
                    <Stat label={t("today.pointsOutstanding")} value={num(data.loyalty.outstanding)} to="/loyalty" />
                  </div>
                </section>
              </>
            ) : null}
            {!canWrite ? <p className="muted small">{t("license.readOnlyNote")}</p> : null}
            <p className="tiny muted" style={{ textAlign: "center" }}>{t("today.asOf", { date: localDate(new Date()) })}</p>
          </>
        ) : null}
      </div>
      {picker ? <CustomerPicker onClose={() => setPicker(false)} onPick={(c) => { setPicker(false); setBuyFor(c.id); }} /> : null}
      {buyFor ? <PurchaseSheet customerId={buyFor} onClose={() => setBuyFor(null)} /> : null}
    </Page>
  );
}

