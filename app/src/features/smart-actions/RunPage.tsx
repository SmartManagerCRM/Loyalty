import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Ban, CalendarPlus, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Banner, Button, Card, Empty, Initials, Sheet, Spinner, TextArea } from "../../components/ui";
import { BUILT_IN_STATUSES, Channel } from "../../domain/types";
import { renderTemplate } from "../../domain/templates";
import { buildChannelLink } from "../../domain/messaging";
import { copyText, openExternal } from "../../services/files";
import { statusLabel } from "../customers/CustomerProfile";
import { FollowUpSheet } from "../customers/sheets";
import { buildValues } from "./messaging";

export function RunPage() {
  const { id = "" } = useParams();
  const { svc, settings, t, reason, date, bump, toast, fail } = useApp();
  const [followFor, setFollowFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<{ customerId: string; note: string } | null>(null);

  const { data, loading } = useData(async () => {
    const res = await svc.actions.run(id);
    if (!res) return null;
    const insights = await svc.insights.loadAll({ includeArchived: true });
    const insightMap = new Map(insights.map((i) => [i.id, i]));
    const customers = await svc.customers.list({ includeArchived: true });
    const cmap = new Map(customers.map((c) => [c.id, c]));
    const values = await buildValues(svc, res.members.map((m) => ({ id: m.customerId, name: m.customerName })), res.run.messageBody ?? "", insightMap);
    return { ...res, cmap, values };
  }, [id]);

  if (loading) return <Page title="" back><Spinner /></Page>;
  if (!data) return <Page title={t("actions.runNotFound")} back><Empty icon={<Ban />} title={t("actions.runNotFound")} /></Page>;
  const { run, members } = data;
  const channel = (run.channel ?? "none") as Channel;
  const statuses = [...BUILT_IN_STATUSES.map((s) => s as string), ...settings.customOutcomes.map((o) => `custom:${o}`)];

  return (
    <Page title={run.name} back>
      <div className="stack-lg">
        <Banner tone="warn">{t("run.notDelivery")}</Banner>
        <Card>
          <div className="stack">
            <div className="small muted">{date(run.createdAt, true)} · {t(`action.${run.type}.title`)} · {channel === "none" ? t("workflow.copyOnly") : t(`channel.${channel}`)}</div>
            <div className="row wrap">
              {Object.entries(run.counts).map(([s, n]) => <Badge key={s} tone={s === "returned" ? "brand" : s === "not_interested" ? "danger" : s === "not_contacted" ? "" : "info"}>{statusLabel(t, s)}: {n}</Badge>)}
            </div>
            <details><summary className="small strong" style={{ cursor: "pointer" }}>{t("run.message")}</summary><div className="pre" style={{ marginTop: 8 }}>{run.messageBody}</div></details>
          </div>
        </Card>
        <div className="stack">
          {members.map((m) => {
            const c = data.cmap.get(m.customerId);
            const dnc = c?.consent === "do_not_contact";
            const rendered = renderTemplate(run.messageBody ?? "", data.values.get(m.customerId) ?? {});
            const link = c && channel !== "none" ? buildChannelLink(channel, c, rendered.text, run.name) : null;
            const blocked = dnc || rendered.missing.length > 0;
            const prepared = async (doThing: () => void | Promise<void>) => {
              try { await doThing(); await svc.actions.markPrepared(id, m.customerId); bump(); } catch (e) { fail(e); }
            };
            return (
              <Card key={m.id}>
                <div className="stack">
                  <div className="row">
                    <Initials name={m.customerName} />
                    <div className="grow"><Link to={`/customers/${m.customerId}`} className="strong" style={{ color: "inherit" }}>{m.customerName}</Link>
                      {m.reasons.map((r, k) => <div key={k} className="reason">{reason(r)}</div>)}</div>
                    {dnc ? <Badge tone="danger"><Ban size={12} />{t("consent.do_not_contact")}</Badge> : null}
                  </div>
                  {rendered.missing.length ? <p className="err small">{t("run.missing", { fields: rendered.missing.map((x) => t(`placeholder.${x}`)).join(", ") })}</p> : null}
                  <div className="row wrap">
                    <Button sm disabled={blocked} write onClick={() => void prepared(async () => { toast((await copyText(rendered.text)) ? t("run.copied") : t("common.copyFailed")); })}><Copy />{t("common.copy")}</Button>
                    {link ? <Button sm disabled={blocked} write onClick={() => void prepared(() => openExternal(link.url))}>{channel === "whatsapp" ? <MessageCircle /> : <ExternalLink />}{t(`run.open.${channel}`)}</Button> : null}
                    <Button sm write onClick={() => setFollowFor(m.customerId)}><CalendarPlus />{t("followup.add")}</Button>
                  </div>
                  <div className="row">
                    <select className="input grow" aria-label={t("run.status")} value={m.status} disabled={dnc && m.status === "not_contacted"}
                      onChange={async (e) => { try { await svc.actions.setStatus(id, m.customerId, e.target.value); bump(); } catch (err) { fail(err); } }}>
                      {statuses.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
                    </select>
                    <Button sm onClick={() => setNoteFor({ customerId: m.customerId, note: m.note ?? "" })}>{m.note ? t("common.note") + " ✓" : t("common.note")}</Button>
                  </div>
                  {m.note ? <p className="small muted">{m.note}</p> : null}
                  <div className="tiny muted">{[m.preparedAt && `${t("run.preparedAt")} ${date(m.preparedAt, true)}`, m.contactedAt && `${t("run.contactedAt")} ${date(m.contactedAt, true)}`].filter(Boolean).join(" · ")}</div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
      {followFor ? <FollowUpSheet customerId={followFor} smartActionId={id} onClose={() => setFollowFor(null)} /> : null}
      {noteFor ? (
        <Sheet title={t("common.note")} onClose={() => setNoteFor(null)} footer={<><Button onClick={() => setNoteFor(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" write onClick={async () => { try { const mem = members.find((x) => x.customerId === noteFor.customerId)!; await svc.actions.setStatus(id, noteFor.customerId, mem.status, noteFor.note); bump(); setNoteFor(null); } catch (e) { fail(e); } }}>{t("common.save")}</Button></>}>
          <TextArea label={t("common.note")} value={noteFor.note} onChange={(e) => setNoteFor({ ...noteFor, note: e.target.value })} maxLength={500} />
        </Sheet>
      ) : null}
    </Page>
  );
}
