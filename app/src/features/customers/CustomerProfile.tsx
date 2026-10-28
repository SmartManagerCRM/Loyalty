import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, Cake, Crown, Gift, MessageCircle, Mail, Pencil, Phone, Plus, Sliders, Smartphone, Trash2, Undo2, Sparkles, Ban } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Banner, Button, Card, ConfirmSheet, Empty, IconButton, Spinner, Tabs, TextArea, TextField } from "../../components/ui";
import { BAND_TONE } from "./CustomersPage";
import { AdjustSheet, FollowUpSheet, PurchaseSheet, RedeemSheet } from "./sheets";
import { buildChannelLink } from "../../domain/messaging";
import { openExternal } from "../../services/files";
import { ACTION_TYPES } from "../../domain/types";
import { evaluateEligibility } from "../../domain/scoring";
import { localDate } from "../../domain/dates";

type Tab = "overview" | "purchases" | "points" | "activity";

export function CustomerProfilePage() {
  const { id = "" } = useParams();
  const { svc, settings, t, num, money, date, reason, bump, fail, toast } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [sheet, setSheet] = useState<null | "purchase" | "redeem" | "adjust" | "followup" | "archive" | "delete">(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const { data, loading } = useData(async () => {
    const customer = await svc.customers.get(id);
    if (!customer) return null;
    const [insight, txs, ledger, reds, follow, history] = await Promise.all([
      svc.insights.loadOne(id), svc.loyalty.transactions(id), svc.loyalty.ledger(id), svc.loyalty.redemptions({ customerId: id }),
      svc.actions.followUps({ customerId: id }), svc.actions.history(id),
    ]);
    return { customer, insight, txs, ledger, reds, follow, history };
  }, [id]);

  if (loading) return <Page title="" back><Spinner /></Page>;
  if (!data) return <Page title={t("customers.notFound")} back><Empty icon={<Ban />} title={t("customers.notFound")} /></Page>;
  const { customer: c, insight: i } = data;
  const dnc = c.consent === "do_not_contact";
  const archived = !!c.archivedAt;
  const eligible = i ? ACTION_TYPES.filter((a) => a !== "custom").map((a) => ({ a, cand: evaluateEligibility(a, i, settings.scoring) })).filter((x) => x.cand) : [];
  const contact = (ch: "whatsapp" | "sms" | "call" | "email") => {
    const l = buildChannelLink(ch, c, "", "");
    if (l) openExternal(ch === "whatsapp" ? `https://wa.me/${c.phoneNorm}` : l.url);
  };
  const done = () => { bump(); };

  return (
    <Page title={c.name} back actions={<><IconButton label={t("common.edit")} onClick={() => nav(`/customers/${id}/edit`)}><Pencil /></IconButton>
      <IconButton label={archived ? t("customers.unarchive") : t("customers.archive")} onClick={() => setSheet("archive")}>{archived ? <ArchiveRestore /> : <Archive />}</IconButton></>}>
      <div className="stack-lg">
        <Card>
          <div className="stack">
            <div className="row wrap">
              <span className="muted small ltr">{c.code}</span>
              {i ? <Badge tone={BAND_TONE[i.band]}>{t(`band.${i.band}`)}</Badge> : null}
              {i?.isVip ? <Badge tone="gold"><Crown size={12} />{i.tierName}</Badge> : null}
              {dnc ? <Badge tone="danger"><Ban size={12} />{t("consent.do_not_contact")}</Badge> : <Badge>{t(`consent.${c.consent}`)}</Badge>}
              {archived ? <Badge>{t("filter.archived")}</Badge> : null}
            </div>
            <div className="row between">
              <div>
                <div className="points num" data-testid="points-balance">{num(i?.pointsBalance ?? 0)}</div>
                <div className="small muted">{t("profile.points")}</div>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <Button variant="primary" write disabled={archived} onClick={() => setSheet("purchase")}><Plus />{t("profile.addPurchase")}</Button>
                <div className="row">
                  <Button sm write disabled={archived} onClick={() => setSheet("redeem")}><Gift />{t("profile.redeem")}</Button>
                  <Button sm write disabled={archived} onClick={() => setSheet("adjust")}><Sliders />{t("profile.adjust")}</Button>
                </div>
              </div>
            </div>
            <div className="row wrap">
              {c.phone ? <span className="ltr small">{c.phone}</span> : null}
              {c.email ? <span className="ltr small">{c.email}</span> : null}
              {c.birthday ? <span className="small row" style={{ gap: 4 }}><Cake size={14} />{c.birthday.startsWith("--") ? c.birthday.slice(2) : date(c.birthday)}</span> : null}
            </div>
            {dnc ? <Banner tone="warn">{t("profile.dncNote")}</Banner> : (
              <div className="row wrap">
                {c.phoneNorm ? <><Button sm onClick={() => contact("whatsapp")}><MessageCircle />{t("channel.whatsapp")}</Button>
                  <Button sm onClick={() => contact("call")}><Phone />{t("channel.call")}</Button>
                  <Button sm onClick={() => contact("sms")}><Smartphone />{t("channel.sms")}</Button></> : null}
                {c.email ? <Button sm onClick={() => contact("email")}><Mail />{t("channel.email")}</Button> : null}
              </div>
            )}
            {c.tags.length ? <div className="row wrap">{c.tags.map((x) => <Badge key={x} tone="info">{x}</Badge>)}</div> : null}
            {c.notes ? <p className="small pre">{c.notes}</p> : null}
          </div>
        </Card>

        <Tabs<Tab> value={tab} onChange={setTab} options={[
          { value: "overview", label: t("profile.tab.overview") }, { value: "purchases", label: t("profile.tab.purchases") },
          { value: "points", label: t("profile.tab.points") }, { value: "activity", label: t("profile.tab.activity") }]} />

        {tab === "overview" && i ? (
          <div className="stack">
            <Card>
              <div className="kv"><span className="muted">{t("profile.segment")}</span><strong>{t(`band.${i.band}`)}</strong></div>
              <div className="kv"><span className="muted">{t("profile.visits")}</span><strong className="num">{num(i.visitCount)}</strong></div>
              <div className="kv"><span className="muted">{t("profile.totalSpent")}</span><strong className="num">{money(i.spendMinor)}</strong></div>
              <div className="kv"><span className="muted">{t("profile.lastPurchase")}</span><strong>{i.lastVisitOn ? `${date(i.lastVisitOn)} · ${t("common.daysAgo", { days: i.daysSinceLast ?? 0 })}` : t("common.never")}</strong></div>
              <div className="kv"><span className="muted">{t("profile.usualInterval")}</span><strong>{i.intervalFromHistory ? t("common.daysN", { days: i.usualIntervalDays ?? 0 }) : t("profile.intervalAssumed", { days: i.effectiveIntervalDays })}</strong></div>
              <div className="kv"><span className="muted">{t("profile.last90")}</span><strong>{t("profile.freq", { recent: i.recent90, prior: i.prior90 })}</strong></div>
              {i.nextFollowUpOn ? <div className="kv"><span className="muted">{t("profile.nextFollowUp")}</span><strong>{date(i.nextFollowUpOn)}</strong></div> : null}
            </Card>
            <h3 className="section-title">{t("profile.suggested")}</h3>
            {eligible.length === 0 ? <p className="muted">{t("profile.noSuggestion")}</p> : null}
            {eligible.map(({ a, cand }) => (
              <Link key={a} to={`/actions/${a}`} className="card link">
                <div className="row"><Sparkles color="var(--brand-deep)" /><div className="grow"><div className="strong">{t(`action.${a}.title`)}</div>
                  {cand!.reasons.map((r, k) => <div key={k} className="reason">{reason(r)}</div>)}</div></div>
              </Link>
            ))}
          </div>
        ) : null}

        {tab === "purchases" ? (
          data.txs.length === 0 ? <Empty icon={<Plus />} title={t("profile.noPurchases")} /> : (
            <div className="card flush list">
              {data.txs.map((x) => (
                <div key={x.id} className="list-row" style={{ cursor: "default" }}>
                  <div className="grow">
                    <div className="strong num" style={x.status === "reversed" ? { textDecoration: "line-through" } : undefined}>{money(x.amountMinor)}</div>
                    <div className="small muted">{date(x.occurredAt, true)}{x.note ? ` · ${x.note}` : ""}{x.source === "import" ? ` · ${t("profile.imported")}` : ""}</div>
                    {x.status === "reversed" ? <div className="small err">{t("profile.reversed")}: {x.reversalReason}</div> : null}
                  </div>
                  <div style={{ textAlign: "end" }}>{x.pointsEarned ? <Badge tone="brand">+{x.pointsEarned}</Badge> : null}</div>
                  {x.status === "active" && !archived ? <IconButton label={t("profile.reverse")} onClick={() => setReverseId(x.id)}><Undo2 /></IconButton> : null}
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === "points" ? (
          <div className="stack">
            {data.ledger.length === 0 ? <Empty icon={<Gift />} title={t("profile.noLedger")} /> : (
              <div className="card flush list">
                {data.ledger.map((l) => (
                  <div key={l.id} className="list-row" style={{ cursor: "default" }}>
                    <div className="grow"><div className="strong">{t(`ledger.${l.kind}`)}</div><div className="small muted">{date(l.createdAt, true)}{l.reason ? ` · ${l.reason}` : ""}</div></div>
                    <strong className="num" style={{ color: l.delta > 0 ? "var(--brand-deep)" : "var(--danger)" }}>{l.delta > 0 ? "+" : ""}{num(l.delta)}</strong>
                  </div>
                ))}
              </div>
            )}
            {data.reds.length ? (
              <>
                <h3 className="section-title">{t("profile.redemptions")}</h3>
                <div className="card flush list">
                  {data.reds.map((r) => (
                    <div key={r.id} className="list-row" style={{ cursor: "default" }}>
                      <div className="grow"><div className="strong">{r.rewardName}</div><div className="small muted">{date(r.redeemedAt, true)} · {t("redeem.cost", { points: r.pointsCost })}{r.status === "cancelled" ? ` · ${t("profile.cancelled")}: ${r.cancelReason}` : ""}</div></div>
                      {r.status === "redeemed" ? <Button sm write onClick={() => setCancelId(r.id)}>{t("common.cancel")}</Button> : <Badge>{t("profile.cancelled")}</Badge>}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {tab === "activity" ? (
          <div className="stack">
            <div className="row between"><h3 className="section-title">{t("profile.followups")}</h3><Button sm write onClick={() => setSheet("followup")}><Plus />{t("followup.add")}</Button></div>
            {data.follow.length === 0 ? <p className="muted small">{t("followup.none")}</p> : (
              <div className="card flush list">
                {data.follow.map((f) => (
                  <div key={f.id} className="list-row" style={{ cursor: "default" }}>
                    <div className="grow"><div className="strong">{date(f.dueOn)}{f.status === "open" && f.dueOn < localDate(new Date()) ? <> <Badge tone="danger">{t("followup.overdue")}</Badge></> : null}</div>
                      {f.note ? <div className="small muted">{f.note}</div> : null}</div>
                    {f.status === "open" ? <Button sm write onClick={async () => { try { await svc.actions.setFollowUpStatus(f.id, "done"); bump(); } catch (e) { fail(e); } }}>{t("followup.done")}</Button> : <Badge>{t(`followup.status.${f.status}`)}</Badge>}
                  </div>
                ))}
              </div>
            )}
            <h3 className="section-title">{t("profile.outreach")}</h3>
            {data.history.length === 0 ? <p className="muted small">{t("profile.noOutreach")}</p> : (
              <div className="card flush list">
                {data.history.map((h) => (
                  <Link key={h.actionId + h.at} to={`/actions/run/${h.actionId}`} className="list-row"><div className="grow"><div className="strong">{h.name}</div><div className="small muted">{date(h.at, true)}</div></div><Badge>{statusLabel(t, h.status)}</Badge></Link>
                ))}
              </div>
            )}
            {archived ? <Button variant="danger" write onClick={() => setSheet("delete")}><Trash2 />{t("customers.deletePermanent")}</Button> : null}
          </div>
        ) : null}
      </div>

      {sheet === "purchase" ? <PurchaseSheet customerId={id} onClose={() => setSheet(null)} onDone={done} /> : null}
      {sheet === "redeem" ? <RedeemSheet customerId={id} onClose={() => setSheet(null)} /> : null}
      {sheet === "adjust" ? <AdjustSheet customerId={id} onClose={() => setSheet(null)} /> : null}
      {sheet === "followup" ? <FollowUpSheet customerId={id} onClose={() => setSheet(null)} /> : null}
      {sheet === "archive" ? (
        <ConfirmSheet title={archived ? t("customers.unarchive") : t("customers.archive")} text={archived ? t("customers.unarchiveText") : t("customers.archiveText")} confirmLabel={t("common.confirm")} onClose={() => setSheet(null)}
          onConfirm={async () => { try { await svc.customers.setArchived(id, !archived); toast(t("common.done")); bump(); setSheet(null); if (!archived) nav("/customers", { replace: true }); } catch (e) { fail(e); } }} />
      ) : null}
      {sheet === "delete" ? (
        <ConfirmSheet title={t("customers.deletePermanent")} danger confirmLabel={t("common.delete")} disabled={confirmText.trim() !== c.code} onClose={() => setSheet(null)}
          onConfirm={async () => { try { await svc.customers.deletePermanently(id); toast(t("common.done")); bump(); nav("/customers", { replace: true }); } catch (e) { fail(e); } }}>
          <p>{t("customers.deleteText")}</p>
          <TextField label={t("customers.typeCode", { code: c.code })} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} dir="ltr" />
        </ConfirmSheet>
      ) : null}
      {reverseId ? (
        <ConfirmSheet title={t("profile.reverse")} text={t("profile.reverseText")} confirmLabel={t("profile.reverse")} danger disabled={!why.trim()} onClose={() => { setReverseId(null); setWhy(""); }}
          onConfirm={async () => { try { await svc.loyalty.reversePurchase(reverseId, why); toast(t("common.done")); bump(); setReverseId(null); setWhy(""); } catch (e) { fail(e); } }}>
          <TextArea label={t("adjust.reason")} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} />
        </ConfirmSheet>
      ) : null}
      {cancelId ? (
        <ConfirmSheet title={t("profile.cancelRedemption")} text={t("profile.cancelRedemptionText")} confirmLabel={t("common.confirm")} danger disabled={!why.trim()} onClose={() => { setCancelId(null); setWhy(""); }}
          onConfirm={async () => { try { await svc.loyalty.cancelRedemption(cancelId, why); toast(t("common.done")); bump(); setCancelId(null); setWhy(""); } catch (e) { fail(e); } }}>
          <TextArea label={t("adjust.reason")} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} />
        </ConfirmSheet>
      ) : null}
    </Page>
  );
}

export function statusLabel(t: (k: string, p?: Record<string, string | number>) => string, status: string): string {
  return status.startsWith("custom:") ? status.slice(7) : t(`status.${status}`);
}
