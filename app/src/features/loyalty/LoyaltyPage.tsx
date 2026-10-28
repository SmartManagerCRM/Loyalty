import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Crown, Gift, Pencil, Plus, Tag } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Banner, Button, Card, Check, Empty, Initials, ListRow, SelectField, Sheet, Spinner, Stat, Tabs, TextArea, TextField } from "../../components/ui";
import { LoyaltyService } from "../../repositories/loyalty";
import { DomainError } from "../../database/db";
import { minorToDecimalString, parseMoney } from "../../domain/money";
import { localDate } from "../../domain/dates";
import type { AudienceType, Offer, Reward, VipTier } from "../../domain/types";
import { CustomerPicker } from "../customers/sheets";

type Tab = "points" | "rewards" | "vip" | "offers";

export function LoyaltyPage() {
  const { t } = useApp();
  const [qs, setQs] = useSearchParams();
  const tab = (qs.get("tab") as Tab) || "points";
  return (
    <Page title={t("nav.loyalty")} root>
      <div className="stack-lg">
        <Tabs value={tab} onChange={(v) => setQs({ tab: v }, { replace: true })} options={[
          { value: "points", label: t("loyalty.tab.points") }, { value: "rewards", label: t("loyalty.tab.rewards") },
          { value: "vip", label: t("loyalty.tab.vip") }, { value: "offers", label: t("loyalty.tab.offers") }]} />
        {tab === "points" ? <PointsTab /> : tab === "rewards" ? <RewardsTab /> : tab === "vip" ? <VipTab /> : <OffersTab />}
      </div>
    </Page>
  );
}

// ───────────── Points overview & earn rule ─────────────
function PointsTab() {
  const { svc, settings, t, num, money, bump, toast, fail, canWrite } = useApp();
  const [edit, setEdit] = useState(false);
  const { data, loading } = useData(async () => {
    const insights = await svc.insights.loadAll();
    const d = await svc.dashboard.load();
    return { top: [...insights].sort((a, b) => b.pointsBalance - a.pointsBalance).filter((i) => i.pointsBalance > 0).slice(0, 5), d, ready: insights.filter((i) => i.rewardReady).length };
  }, []);
  const r = settings.earnRule;
  return (
    <>
      <Card>
        <div className="stack">
          <div className="row between"><h3>{t("loyalty.earnRule")}</h3><Button sm write onClick={() => setEdit(true)}><Pencil />{t("common.edit")}</Button></div>
          <p>{t("loyalty.earnRuleText", { points: r.points, amount: money(r.perAmountMinor) })}{r.perVisitBonus ? ` ${t("loyalty.visitBonusText", { points: r.perVisitBonus })}` : ""}{r.minPurchaseMinor ? ` ${t("loyalty.minPurchaseText", { amount: money(r.minPurchaseMinor) })}` : ""}</p>
        </div>
      </Card>
      {loading ? <Spinner /> : null}
      {data ? (
        <>
          <div className="grid3">
            <Stat label={t("today.pointsOutstanding")} value={num(data.d.loyalty.outstanding)} tone="brand" />
            <Stat label={t("today.pointsEarned")} value={num(data.d.loyalty.earned30)} sub={t("today.last30")} />
            <Stat label={t("today.pointsRedeemed")} value={num(data.d.loyalty.redeemed30)} sub={t("today.last30")} />
          </div>
          <Link to="/actions/points_reminder" className="card link"><div className="row"><Gift color="var(--brand-deep)" /><div className="grow strong">{t("loyalty.readyCount", { count: data.ready })}</div></div></Link>
          <h2 className="section-title">{t("loyalty.topBalances")}</h2>
          {data.top.length === 0 ? <p className="muted small">{t("loyalty.noPoints")}</p> : (
            <div className="card flush list">{data.top.map((i) => <ListRow key={i.id} to={`/customers/${i.id}`} leading={<Initials name={i.name} gold={i.isVip} />} title={i.name} trailing={<strong className="num">{num(i.pointsBalance)}</strong>} />)}</div>
          )}
        </>
      ) : null}
      <IntegrityCheck />
      {edit ? <EarnRuleSheet onClose={() => setEdit(false)} onSaved={() => { toast(t("common.saved")); bump(); setEdit(false); }} fail={fail} canWrite={canWrite} /> : null}
    </>
  );
}

function IntegrityCheck() {
  const { svc, t } = useApp();
  const [res, setRes] = useState<number | null>(null);
  return (
    <Card><div className="row between"><div className="grow"><div className="strong">{t("loyalty.integrity")}</div><div className="small muted">{t("loyalty.integrityText")}</div>
      {res !== null ? <div className={res === 0 ? "small" : "small err"} style={{ marginTop: 4 }}>{res === 0 ? t("loyalty.integrityOk") : t("loyalty.integrityBad", { count: res })}</div> : null}</div>
      <Button sm onClick={async () => setRes((await svc.loyalty.reconcile()).length)}>{t("loyalty.check")}</Button></div></Card>
  );
}

function EarnRuleSheet({ onClose, onSaved, fail }: { onClose(): void; onSaved(): void; fail(e: unknown): void; canWrite: boolean }) {
  const { svc, settings, t } = useApp();
  const dec = settings.currency.decimals;
  const r = settings.earnRule;
  const [per, setPer] = useState(minorToDecimalString(r.perAmountMinor, dec));
  const [pts, setPts] = useState(String(r.points));
  const [bonus, setBonus] = useState(String(r.perVisitBonus));
  const [min, setMin] = useState(minorToDecimalString(r.minPurchaseMinor, dec));
  return (
    <Sheet title={t("loyalty.earnRule")} onClose={onClose} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" write onClick={async () => {
      try {
        const perAmountMinor = parseMoney(per, dec); const minPurchaseMinor = parseMoney(min || "0", dec);
        if (perAmountMinor === null || minPurchaseMinor === null) throw new DomainError("amount_invalid");
        await svc.loyalty.saveEarnRule({ perAmountMinor, points: Number(pts), perVisitBonus: Number(bonus || 0), minPurchaseMinor });
        onSaved();
      } catch (e) { fail(e); }
    }}>{t("common.save")}</Button></>}>
      <p className="muted small">{t("loyalty.earnRuleHelp")}</p>
      <div className="grid2">
        <TextField label={t("setup.spendAmount", { currency: settings.currency.code })} inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value)} dir="ltr" />
        <TextField label={t("setup.pointsEarned")} inputMode="numeric" value={pts} onChange={(e) => setPts(e.target.value)} dir="ltr" />
      </div>
      <TextField label={t("loyalty.visitBonus")} inputMode="numeric" value={bonus} onChange={(e) => setBonus(e.target.value)} dir="ltr" hint={t("loyalty.visitBonusHint")} />
      <TextField label={t("loyalty.minPurchase", { currency: settings.currency.code })} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} dir="ltr" />
      <Banner>{t("loyalty.ruleNotRetro")}</Banner>
    </Sheet>
  );
}

// ───────────── Rewards ─────────────
function rewardState(r: Reward, now: Date): "active" | "inactive" | "expired" {
  if (!r.active || r.archivedAt) return "inactive";
  return LoyaltyService.isRewardRedeemable(r, now) ? "active" : "expired";
}

function RewardsTab() {
  const { svc, t, date, num, bump, fail, toast } = useApp();
  const [edit, setEdit] = useState<Reward | "new" | null>(null);
  const { data, loading } = useData(async () => ({ rewards: await svc.loyalty.rewards(), reds: await svc.loyalty.redemptions({ limit: 15 }), customers: new Map((await svc.customers.list({ includeArchived: true })).map((c) => [c.id, c.name])) }), []);
  const now = new Date();
  return (
    <>
      <div className="row between"><h2 className="section-title">{t("rewards.catalogue")}</h2><Button sm variant="primary" write onClick={() => setEdit("new")}><Plus />{t("rewards.add")}</Button></div>
      {loading ? <Spinner /> : null}
      {data && data.rewards.length === 0 ? <Empty icon={<Gift />} title={t("rewards.emptyTitle")} text={t("rewards.emptyText")} /> : null}
      {data && data.rewards.length ? (
        <div className="card flush list">
          {data.rewards.map((r) => { const s = rewardState(r, now); return (
            <ListRow key={r.id} onClick={() => setEdit(r)} title={r.name} sub={`${t("redeem.cost", { points: num(r.pointsCost) })}${r.expiresAt ? ` · ${t("rewards.expires")} ${date(r.expiresAt)}` : ""}`} trailing={<Badge tone={s === "active" ? "brand" : s === "expired" ? "danger" : ""}>{t(`status.${s}`)}</Badge>} />
          ); })}
        </div>
      ) : null}
      {data && data.reds.length ? (
        <>
          <h2 className="section-title">{t("rewards.recent")}</h2>
          <div className="card flush list">{data.reds.map((x) => (
            <ListRow key={x.id} to={`/customers/${x.customerId}`} title={x.rewardName} sub={`${data.customers.get(x.customerId) ?? ""} · ${date(x.redeemedAt, true)}`} trailing={x.status === "cancelled" ? <Badge>{t("profile.cancelled")}</Badge> : <Badge tone="brand">-{x.pointsCost}</Badge>} />
          ))}</div>
        </>
      ) : null}
      {edit ? <RewardSheet reward={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={() => { toast(t("common.saved")); bump(); setEdit(null); }} fail={fail} /> : null}
    </>
  );
}

function RewardSheet({ reward, onClose, onDone, fail }: { reward: Reward | null; onClose(): void; onDone(): void; fail(e: unknown): void }) {
  const { svc, t, bump } = useApp();
  const [name, setName] = useState(reward?.name ?? "");
  const [desc, setDesc] = useState(reward?.description ?? "");
  const [cost, setCost] = useState(reward ? String(reward.pointsCost) : "");
  const [active, setActive] = useState(reward?.active ?? true);
  const [expires, setExpires] = useState(reward?.expiresAt ? localDate(reward.expiresAt) : "");
  return (
    <Sheet title={reward ? t("rewards.edit") : t("rewards.add")} onClose={onClose} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" write onClick={async () => {
      try { await svc.loyalty.saveReward({ id: reward?.id, name, description: desc || null, pointsCost: Number(cost), active, expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null }); onDone(); } catch (e) { fail(e); }
    }}>{t("common.save")}</Button></>}>
      <TextField label={t("rewards.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
      <TextField label={t("rewards.cost")} inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ""))} dir="ltr" />
      <TextArea label={t("common.description")} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} />
      <TextField label={`${t("rewards.expires")} (${t("common.optional")})`} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      <Check label={t("status.active")} checked={active} onChange={setActive} />
      {reward ? <Button variant="danger" write onClick={async () => { try { await svc.loyalty.archiveReward(reward.id); bump(); onDone(); } catch (e) { fail(e); } }}>{t("common.delete")}</Button> : null}
    </Sheet>
  );
}

// ───────────── VIP ─────────────
function VipTab() {
  const { svc, t, num, money, bump, fail, toast } = useApp();
  const [edit, setEdit] = useState<VipTier | "new" | null>(null);
  const { data, loading } = useData(async () => {
    const tiers = await svc.loyalty.tiers(true);
    const insights = await svc.insights.loadAll();
    return { tiers, insights };
  }, []);
  return (
    <>
      <Banner>{t("vip.intro")}</Banner>
      <div className="row between"><h2 className="section-title">{t("vip.tiers")}</h2><Button sm variant="primary" write onClick={() => setEdit("new")}><Plus />{t("vip.add")}</Button></div>
      {loading ? <Spinner /> : null}
      {data && data.tiers.length === 0 ? <Empty icon={<Crown />} title={t("vip.emptyTitle")} text={t("vip.emptyText")} /> : null}
      {data?.tiers.map((tier) => {
        const members = data.insights.filter((i) => i.tierId === tier.id);
        return (
          <Card key={tier.id}>
            <div className="stack">
              <div className="row between"><div className="row"><Crown color="var(--gold)" /><strong>{tier.name}</strong>{!tier.active ? <Badge>{t("status.inactive")}</Badge> : null}</div>
                <Button sm write onClick={() => setEdit(tier)}><Pencil />{t("common.edit")}</Button></div>
              <div className="small muted">{[tier.minVisits ? t("vip.reqVisits", { count: tier.minVisits }) : "", tier.minSpendMinor ? t("vip.reqSpend", { amount: money(tier.minSpendMinor) }) : ""].filter(Boolean).join(` ${t("vip.and")} `)}</div>
              {tier.earnMultiplierPct > 100 ? <Badge tone="brand">{t("vip.multiplier", { pct: tier.earnMultiplierPct })}</Badge> : null}
              {tier.benefits ? <p className="small">{tier.benefits}</p> : null}
              <div className="small strong">{t("vip.members", { count: num(members.length) })}</div>
              {members.slice(0, 5).map((m) => <Link key={m.id} to={`/customers/${m.id}`} className="small">{m.name}</Link>)}
              {members.length > 5 ? <Link to="/customers?band=vip" className="small">{t("common.seeAll")}</Link> : null}
            </div>
          </Card>
        );
      })}
      {edit ? <TierSheet tier={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={() => { toast(t("common.saved")); bump(); setEdit(null); }} fail={fail} /> : null}
    </>
  );
}

function TierSheet({ tier, onClose, onDone, fail }: { tier: VipTier | null; onClose(): void; onDone(): void; fail(e: unknown): void }) {
  const { svc, settings, t, bump } = useApp();
  const dec = settings.currency.decimals;
  const [name, setName] = useState(tier?.name ?? "");
  const [visits, setVisits] = useState(String(tier?.minVisits ?? 10));
  const [spend, setSpend] = useState(tier ? minorToDecimalString(tier.minSpendMinor, dec) : "0");
  const [mult, setMult] = useState(String(tier?.earnMultiplierPct ?? 100));
  const [benefits, setBenefits] = useState(tier?.benefits ?? "");
  const [active, setActive] = useState(tier?.active ?? true);
  return (
    <Sheet title={tier ? t("vip.edit") : t("vip.add")} onClose={onClose} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" write onClick={async () => {
      try { await svc.loyalty.saveTier({ id: tier?.id, name, minVisits: Number(visits || 0), minSpendMinor: parseMoney(spend || "0", dec) ?? -1, earnMultiplierPct: Number(mult), benefits: benefits || null, sortOrder: tier?.sortOrder, active }); onDone(); } catch (e) { fail(e); }
    }}>{t("common.save")}</Button></>}>
      <TextField label={t("vip.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
      <p className="hint">{t("vip.criteriaHint")}</p>
      <div className="grid2">
        <TextField label={t("vip.minVisits")} inputMode="numeric" value={visits} onChange={(e) => setVisits(e.target.value)} dir="ltr" />
        <TextField label={t("vip.minSpend", { currency: settings.currency.code })} inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} dir="ltr" />
      </div>
      <TextField label={t("vip.multiplierLabel")} hint={t("vip.multiplierHint")} inputMode="numeric" value={mult} onChange={(e) => setMult(e.target.value)} dir="ltr" />
      <TextArea label={t("vip.benefits")} value={benefits} onChange={(e) => setBenefits(e.target.value)} maxLength={500} />
      <Check label={t("status.active")} checked={active} onChange={setActive} />
      {tier ? <Button variant="danger" write onClick={async () => { try { await svc.loyalty.deleteTier(tier.id); bump(); onDone(); } catch (e) { fail(e); } }}>{t("common.delete")}</Button> : null}
    </Sheet>
  );
}

// ───────────── Offers ─────────────
function OffersTab() {
  const { svc, t, date, num, bump, fail, toast } = useApp();
  const [edit, setEdit] = useState<Offer | "new" | null>(null);
  const { data, loading } = useData(async () => ({ offers: await svc.loyalty.offers(), counts: await svc.loyalty.offerRedemptionCounts() }), []);
  const today = localDate(new Date());
  return (
    <>
      <Banner>{t("offers.intro")}</Banner>
      <div className="row between"><h2 className="section-title">{t("offers.title")}</h2><Button sm variant="primary" write onClick={() => setEdit("new")}><Plus />{t("offers.add")}</Button></div>
      {loading ? <Spinner /> : null}
      {data && data.offers.length === 0 ? <Empty icon={<Tag />} title={t("offers.emptyTitle")} text={t("offers.emptyText")} /> : null}
      {data && data.offers.length ? (
        <div className="card flush list">
          {data.offers.map((o) => { const s = LoyaltyService.offerState(o, today); const used = data.counts.get(o.id) ?? 0; return (
            <ListRow key={o.id} onClick={() => setEdit(o)} title={o.name}
              sub={`${date(o.startsOn)}${o.endsOn ? ` → ${date(o.endsOn)}` : ""} · ${t(`offers.audience.${o.audience}`)} · ${t("offers.used", { count: num(used) })}${o.usageLimitTotal ? ` / ${o.usageLimitTotal}` : ""}`}
              trailing={<Badge tone={s === "live" ? "brand" : s === "scheduled" ? "info" : s === "expired" ? "danger" : ""}>{t(`offers.state.${s}`)}</Badge>} />
          ); })}
        </div>
      ) : null}
      {edit ? <OfferSheet offer={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={() => { toast(t("common.saved")); bump(); setEdit(null); }} fail={fail} /> : null}
    </>
  );
}

function OfferSheet({ offer, onClose, onDone, fail }: { offer: Offer | null; onClose(): void; onDone(): void; fail(e: unknown): void }) {
  const { svc, t, bump } = useApp();
  const [name, setName] = useState(offer?.name ?? "");
  const [desc, setDesc] = useState(offer?.description ?? "");
  const [starts, setStarts] = useState(offer?.startsOn ?? localDate(new Date()));
  const [ends, setEnds] = useState(offer?.endsOn ?? "");
  const [active, setActive] = useState(offer?.active ?? true);
  const [limTotal, setLimTotal] = useState(offer?.usageLimitTotal?.toString() ?? "");
  const [limPer, setLimPer] = useState(offer?.usageLimitPerCustomer?.toString() ?? "");
  const [audience, setAudience] = useState<AudienceType>(offer?.audience ?? "all");
  const [key, setKey] = useState(offer?.audienceKey ?? "band:inactive");
  const [ids, setIds] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const { data: tiers } = useData(() => svc.loyalty.tiers(), []);
  const { data: segs } = useData(() => svc.actions.segments(), []);
  const { data: assigned } = useData(async () => (offer ? svc.loyalty.assignedCustomerIds(offer.id) : []), [offer?.id]);
  const { data: names } = useData(async () => new Map((await svc.customers.list()).map((c) => [c.id, c.name])), []);
  const chosen = ids.length ? ids : assigned ?? [];
  return (
    <Sheet title={offer ? t("offers.edit") : t("offers.add")} onClose={onClose} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" write onClick={async () => {
      try { await svc.loyalty.saveOffer({ id: offer?.id, name, description: desc || null, startsOn: starts, endsOn: ends || null, active, usageLimitTotal: limTotal ? Number(limTotal) : null, usageLimitPerCustomer: limPer ? Number(limPer) : null, audience, audienceKey: audience === "segment" ? key : null, customerIds: audience === "selected" ? chosen : undefined }); onDone(); } catch (e) { fail(e); }
    }}>{t("common.save")}</Button></>}>
      <TextField label={t("offers.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
      <TextArea label={t("offers.description")} hint={t("offers.descriptionHint")} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} />
      <div className="grid2">
        <TextField label={t("offers.starts")} type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
        <TextField label={`${t("offers.ends")} (${t("common.optional")})`} type="date" value={ends} min={starts} onChange={(e) => setEnds(e.target.value)} />
      </div>
      <div className="grid2">
        <TextField label={t("offers.limitTotal")} inputMode="numeric" value={limTotal} onChange={(e) => setLimTotal(e.target.value.replace(/\D/g, ""))} dir="ltr" />
        <TextField label={t("offers.limitPer")} inputMode="numeric" value={limPer} onChange={(e) => setLimPer(e.target.value.replace(/\D/g, ""))} dir="ltr" />
      </div>
      <SelectField label={t("offers.audienceLabel")} value={audience} onChange={(e) => setAudience(e.target.value as AudienceType)}>
        <option value="all">{t("offers.audience.all")}</option><option value="segment">{t("offers.audience.segment")}</option><option value="selected">{t("offers.audience.selected")}</option>
      </SelectField>
      {audience === "segment" ? (
        <SelectField label={t("offers.segment")} value={key} onChange={(e) => setKey(e.target.value)}>
          {(["new", "active", "at_risk", "inactive"] as const).map((b) => <option key={b} value={`band:${b}`}>{t(`band.${b}`)}</option>)}
          <option value="tier:any">{t("offers.anyVip")}</option>
          {(tiers ?? []).map((x) => <option key={x.id} value={`tier:${x.id}`}>{x.name}</option>)}
          {(segs ?? []).map((s) => <option key={s.id} value={`segment:${s.id}`}>{s.name}</option>)}
        </SelectField>
      ) : null}
      {audience === "selected" ? (
        <div className="stack">
          <div className="row wrap">{chosen.map((id) => <Badge key={id} tone="info">{names?.get(id) ?? id}</Badge>)}</div>
          <Button sm onClick={() => setPicker(true)}><Plus />{t("offers.addCustomer")}</Button>
          {chosen.length ? <Button sm variant="ghost" onClick={() => setIds([])}>{t("offers.clear")}</Button> : null}
        </div>
      ) : null}
      <Check label={t("status.active")} checked={active} onChange={setActive} />
      {offer ? <Button variant="danger" write onClick={async () => { try { await svc.loyalty.archiveOffer(offer.id); bump(); onDone(); } catch (e) { fail(e); } }}>{t("common.delete")}</Button> : null}
      {picker ? <CustomerPicker onClose={() => setPicker(false)} onPick={(c) => { setIds([...new Set([...chosen, c.id])]); setPicker(false); }} /> : null}
    </Sheet>
  );
}


