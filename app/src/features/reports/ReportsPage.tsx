import { useState } from "react";
import { Download } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { BarChart, Button, Card, Chips, Spinner, Stat, TextField } from "../../components/ui";
import { addDays, localDate } from "../../domain/dates";
import { saveAndShare } from "../../services/files";
import { statusLabel } from "../customers/CustomerProfile";

type Preset = "7" | "30" | "90" | "365" | "custom";

export function ReportsPage() {
  const { svc, settings, t, num, money, date, fail } = useApp();
  const today = localDate(new Date());
  const [preset, setPreset] = useState<Preset>("30");
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const range = preset === "custom" ? { from, to } : { from: addDays(today, -(Number(preset) - 1)), to: today };
  const valid = range.from <= range.to;
  const { data, loading } = useData(async () => (valid ? svc.reports.build(range) : null), [range.from, range.to]);

  const exportCsv = async () => { if (data) try { await saveAndShare(`report-${range.from}_${range.to}.csv`, svc.reports.toCsv(data, settings.currency.decimals), "text/csv"); } catch (e) { fail(e); } };
  const label = (k: string) => (data?.granularity === "month" ? k.slice(2, 7) : k.slice(5));

  return (
    <Page title={t("reports.title")} back actions={<Button sm disabled={!data} onClick={() => void exportCsv()}><Download />{t("reports.exportCsv")}</Button>}>
      <div className="stack-lg">
        <Chips<Preset> value={preset} onChange={setPreset} options={[{ value: "7", label: t("reports.last", { days: 7 }) }, { value: "30", label: t("reports.last", { days: 30 }) }, { value: "90", label: t("reports.last", { days: 90 }) }, { value: "365", label: t("reports.last", { days: 365 }) }, { value: "custom", label: t("reports.custom") }]} />
        {preset === "custom" ? <div className="grid2"><TextField label={t("reports.from")} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><TextField label={t("reports.to")} type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></div> : null}
        <p className="small muted">{t("reports.range", { from: date(range.from), to: date(range.to) })}</p>
        {loading ? <Spinner /> : null}
        {data ? (
          <>
            <section className="stack"><h2 className="section-title">{t("reports.growth")}</h2>
              <div className="grid3"><Stat label={t("reports.newCustomers")} value={num(data.customers.newInRange)} /><Stat label={t("reports.totalCustomers")} value={num(data.customers.totalAtEnd)} /><Stat label={t("reports.activeBuyers")} value={num(data.customers.purchasing)} /></div></section>

            <section className="stack"><h2 className="section-title">{t("reports.purchases")}</h2>
              <div className="grid3"><Stat label={t("reports.count")} value={num(data.purchases.count)} /><Stat label={t("today.revenue")} value={<span style={{ fontSize: "1rem" }}>{money(data.purchases.revenueMinor)}</span>} /><Stat label={t("reports.average")} value={<span style={{ fontSize: "1rem" }}>{money(data.purchases.averageMinor)}</span>} /></div>
              <Card>{data.purchases.count === 0 && data.customers.newInRange === 0 ? <p className="muted small">{t("reports.noData")}</p> : (
                <>
                  <BarChart ariaLabel={t("reports.chartLabel")} data={data.purchases.buckets.map((b) => ({ label: label(b.key), value: b.purchases }))} secondary={data.purchases.buckets.map((b) => b.newCustomers)} labelEvery={Math.ceil(data.purchases.buckets.length / 6)} />
                  <div className="row small muted" style={{ gap: 14 }}><span><i style={{ background: "var(--brand)", display: "inline-block", width: 10, height: 10, borderRadius: 2 }} /> {t("reports.count")}</span><span><i style={{ background: "var(--info)", display: "inline-block", width: 10, height: 10, borderRadius: 2 }} /> {t("reports.newCustomers")}</span><span>({t(`reports.by.${data.granularity}`)})</span></div>
                </>
              )}</Card></section>

            <section className="stack"><h2 className="section-title">{t("reports.repeat")}</h2>
              <div className="grid3"><Stat label={t("reports.repeatCustomers")} value={num(data.repeat.repeatCustomers)} /><Stat label={t("reports.repeatRate")} value={data.repeat.repeatRatePct === null ? "—" : `${data.repeat.repeatRatePct}%`} /><Stat label={t("reports.newBuyers")} value={num(data.repeat.newBuyers)} sub={t("reports.returningBuyers", { count: num(data.repeat.returningBuyers) })} /></div>
              <p className="hint">{t("reports.repeatNote")}</p></section>

            <section className="stack"><h2 className="section-title">{t("reports.points")}</h2>
              <div className="grid2 grid-auto"><Stat label={t("today.pointsEarned")} value={num(data.points.earned)} /><Stat label={t("today.pointsRedeemed")} value={num(data.points.redeemed)} /><Stat label={t("reports.pointsOutstanding")} value={num(data.points.outstandingNow)} sub={t("reports.asOfToday")} />
                <Stat label={t("reports.adjusted")} value={num(data.points.adjustedNet)} /><Stat label={t("reports.reversed")} value={num(data.points.reversed)} /></div></section>

            <section className="stack"><h2 className="section-title">{t("reports.rewards")}</h2>
              <Card>{data.rewards.byReward.length === 0 ? <p className="muted small">{t("reports.noRedemptions")}</p> : data.rewards.byReward.map((r) => <div key={r.name} className="kv"><span>{r.name}</span><strong className="num">{num(r.count)} · {num(r.points)} {t("reports.pts")}</strong></div>)}
                {data.rewards.cancelled ? <p className="small muted">{t("reports.cancelledRedemptions", { count: data.rewards.cancelled })}</p> : null}</Card></section>

            <section className="stack"><h2 className="section-title">{t("reports.actions")}</h2>
              <Card>{data.actions.byType.length === 0 ? <p className="muted small">{t("reports.noActions")}</p> : data.actions.byType.map((a) => (
                <div key={a.type} className="stack" style={{ gap: 2, paddingBlock: 8, borderTop: "1px solid var(--border)" }}>
                  <strong>{t(`action.${a.type}.title`)}</strong>
                  <div className="small muted">{t("reports.actionLine", { total: a.total, contacted: a.contacted + a.replied + a.returned + a.notInterested, replied: a.replied + a.returned, returned: a.returned })}</div>
                  <div className="small">{t("reports.purchasedAfter", { count: a.purchasedAfter })}</div></div>
              ))}<p className="hint">{t("reports.actionsNote")} ({statusLabel(t, "returned")})</p></Card></section>

            <section className="stack"><h2 className="section-title">{t("reports.followups")}</h2>
              <div className="grid3"><Stat label={t("reports.created")} value={num(data.followUps.created)} /><Stat label={t("followup.done")} value={num(data.followUps.done)} /><Stat label={t("reports.overdueNow")} value={num(data.followUps.openOverdueNow)} tone={data.followUps.openOverdueNow ? "warn" : ""} /></div></section>

            <section className="stack"><h2 className="section-title">{t("reports.vipSegments")} ({t("reports.snapshot")})</h2>
              <Card>{data.snapshot.tiers.map((x) => <div key={x.name} className="kv"><span>{x.name}</span><strong className="num">{num(x.count)}</strong></div>)}
                {data.snapshot.bands.map((b) => <div key={b.band} className="kv"><span>{t(`band.${b.band}`)}</span><strong className="num">{num(b.count)}</strong></div>)}</Card></section>

            <section className="stack"><h2 className="section-title">{t("reports.offers")}</h2>
              <div className="grid2"><Stat label={t("reports.offersCreated")} value={num(data.offers.created)} /><Stat label={t("reports.offersRedeemed")} value={num(data.offers.redeemed)} /></div>
              {data.offers.byOffer.length ? <Card>{data.offers.byOffer.map((o) => <div key={o.name} className="kv"><span>{o.name}</span><strong className="num">{num(o.count)}</strong></div>)}</Card> : null}</section>
          </>
        ) : null}
      </div>
    </Page>
  );
}
