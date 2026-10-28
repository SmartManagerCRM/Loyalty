import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Ban, Clock3, MessageSquareText, Phone } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Banner, Button, Check, Empty, Initials, SelectField, Spinner, TextArea, TextField } from "../../components/ui";
import { ACTION_TYPES, ActionType, Channel } from "../../domain/types";
import { PLACEHOLDERS, renderTemplate } from "../../domain/templates";
import { buildValues } from "./messaging";

export function WorkflowPage() {
  const { type: raw = "" } = useParams();
  const [qs] = useSearchParams();
  if (!(ACTION_TYPES as string[]).includes(raw)) return <Navigate to="/actions" replace />;
  return <Workflow type={raw as ActionType} segmentId={qs.get("segment") ?? undefined} />;
}

function Workflow({ type, segmentId }: { type: ActionType; segmentId?: string }) {
  const { svc, settings, t, num, reason, lang, fail } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState<"select" | "compose">("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, loading } = useData(async () => {
    const insights = await svc.insights.loadAll();
    const rows = await svc.actions.eligible(type, { segmentId, insights });
    const templates = await svc.actions.templates({ type });
    const segment = segmentId ? await svc.actions.segment(segmentId) : null;
    return { rows, templates, segment, insightMap: new Map(insights.map((i) => [i.id, i])) };
  }, [type, segmentId]);

  // preselect everyone who can be contacted and was not contacted recently
  useEffect(() => {
    if (!data) return;
    setSelected(new Set(data.rows.filter((r) => !r.candidate.blocked && !r.candidate.recentlyContacted).map((r) => r.insight.id)));
  }, [data]);
  useEffect(() => {
    if (!data || templateId || !data.templates.length) return;
    const tpl = data.templates.find((x) => x.language === lang) ?? data.templates[0]!;
    setTemplateId(tpl.id);
    setBody(tpl.body);
  }, [data, lang, templateId]);

  const selectable = useMemo(() => (data?.rows ?? []).filter((r) => !r.candidate.blocked), [data]);
  const chosen = useMemo(() => (data?.rows ?? []).filter((r) => selected.has(r.insight.id)), [data, selected]);
  const { data: customers } = useData(async () => (step === "compose" ? svc.customers.list() : []), [step]);
  const custMap = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);
  const { data: preview } = useData(async () => {
    if (step !== "compose" || !data) return null;
    const list = chosen.map((r) => ({ id: r.insight.id, name: r.insight.name }));
    const values = await buildValues(svc, list, body, data.insightMap);
    const per = list.map((c) => ({ ...c, ...renderTemplate(body, values.get(c.id) ?? {}) }));
    return per;
  }, [step, body, chosen.length, data]);

  const title = type === "custom" && data?.segment ? data.segment.name : t(`action.${type}.title`);

  if (type === "custom" && !segmentId) return <CustomChooser />;

  const missingCount = preview?.filter((p) => p.missing.length).length ?? 0;
  const unknown = preview?.[0]?.unknown ?? renderTemplate(body, {}).unknown;
  const noContact = chosen.filter((r) => !custMap.get(r.insight.id)?.phoneNorm && !custMap.get(r.insight.id)?.email).length;
  const create = async () => {
    setBusy(true);
    try {
      const id = await svc.actions.startRun({
        type, name: name.trim() || `${title} · ${new Date().toLocaleDateString()}`, segmentId: segmentId ?? null, templateId: templateId || null, messageBody: body, channel,
        members: chosen.map((r) => ({ customerId: r.insight.id, reasons: r.candidate.reasons })),
      });
      nav(`/actions/run/${id}`, { replace: true });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Page title={title} back>
      <div className="stack-lg">
        {step === "select" ? (
          <>
            <p className="muted">{type === "custom" ? t("action.custom.desc") : t(`action.${type}.desc`)}</p>
            <Banner>{t("workflow.why")}</Banner>
            {loading ? <Spinner /> : null}
            {data && data.rows.length === 0 ? <Empty icon={<MessageSquareText />} title={t("workflow.emptyTitle")} text={t(`action.${type}.empty`)} /> : null}
            {data && data.rows.length > 0 ? (
              <>
                <div className="row between">
                  <Check label={t("workflow.selectAll", { count: selectable.length })} checked={selected.size === selectable.length && selectable.length > 0}
                    onChange={(v) => setSelected(v ? new Set(selectable.map((r) => r.insight.id)) : new Set())} />
                </div>
                <div className="card flush list">
                  {data.rows.map((r) => {
                    const id = r.insight.id;
                    const blocked = !!r.candidate.blocked;
                    return (
                      <div key={id} className="list-row" style={{ alignItems: "flex-start", opacity: blocked ? 0.6 : 1 }}>
                        <input type="checkbox" aria-label={r.insight.name} style={{ width: 22, height: 22, marginTop: 8, accentColor: "var(--brand)" }} disabled={blocked} checked={selected.has(id)}
                          onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(id); else n.delete(id); return n; })} />
                        <Link to={`/customers/${id}`} className="grow" style={{ color: "inherit" }}>
                          <div className="row wrap" style={{ gap: 6 }}>
                            <Initials name={r.insight.name} gold={r.insight.isVip} />
                            <div className="grow"><div className="strong">{r.insight.name}</div>
                              <div className="row wrap" style={{ gap: 4 }}>
                                {blocked ? <Badge tone="danger"><Ban size={12} />{t("consent.do_not_contact")}</Badge> : null}
                                {r.candidate.recentlyContacted ? <Badge tone="warn"><Clock3 size={12} />{t("workflow.recent", { days: r.insight.daysSinceContact ?? 0 })}</Badge> : null}
                                {!r.insight.hasPhone ? <Badge><Phone size={12} />{t("workflow.noPhone")}</Badge> : null}
                              </div></div>
                          </div>
                          {r.candidate.reasons.map((x, k) => <div key={k} className="reason" style={{ marginTop: 4 }}>{reason(x)}</div>)}
                        </Link>
                      </div>
                    );
                  })}
                </div>
                <div className="sticky-bar">
                  <span className="grow strong">{t("workflow.selected", { count: num(selected.size) })}</span>
                  <Button variant="primary" write disabled={selected.size === 0} onClick={() => setStep("compose")}>{t("common.continue")}</Button>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <>
            <Banner tone="warn">{t("workflow.notSent")}</Banner>
            <SelectField label={t("workflow.template")} value={templateId} onChange={(e) => { setTemplateId(e.target.value); const tpl = data?.templates.find((x) => x.id === e.target.value); if (tpl) setBody(tpl.body); }}>
              {(data?.templates ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.language})</option>)}
              <option value="">{t("workflow.customMessage")}</option>
            </SelectField>
            <TextArea label={t("workflow.message")} value={body} onChange={(e) => { setBody(e.target.value); setTemplateId((id) => (data?.templates.find((x) => x.id === id)?.body === e.target.value ? id : "")); }} maxLength={1000} />
            <div className="small muted">{t("workflow.placeholders")}: {PLACEHOLDERS.map((p) => <code key={p} className="ltr" style={{ marginInlineEnd: 6 }}>{`{${p}}`}</code>)}</div>
            <SelectField label={t("workflow.channel")} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {(["whatsapp", "sms", "email", "none"] as Channel[]).map((c) => <option key={c} value={c}>{c === "none" ? t("workflow.copyOnly") : t(`channel.${c}`)}</option>)}
            </SelectField>
            {unknown.length ? <Banner tone="danger">{t("workflow.unknown", { tokens: unknown.map((u) => `{${u}}`).join(" ") })}</Banner> : null}
            {missingCount > 0 ? <Banner tone="warn">{t("workflow.missing", { count: missingCount, fields: [...new Set(preview!.flatMap((p) => p.missing))].map((m) => t(`placeholder.${m}`)).join(", ") })}</Banner> : null}
            {noContact > 0 && channel !== "none" ? <Banner>{t("workflow.noContact", { count: noContact })}</Banner> : null}
            <div className="stack">
              <h3 className="section-title">{t("workflow.preview")}{preview?.[0] ? ` — ${preview[0].name}` : ""}</h3>
              <div className="pre" aria-live="polite" data-testid="message-preview">{preview?.[0]?.text ?? body}</div>
            </div>
            <TextField label={t("workflow.runName")} value={name} onChange={(e) => setName(e.target.value)} placeholder={title} />
            <div className="row">
              <Button onClick={() => setStep("select")}>{t("common.back")}</Button>
              <Button variant="primary" write className="grow" busy={busy} disabled={!body.trim() || unknown.length > 0 || chosen.length === 0} onClick={() => void create()}>{t("workflow.create", { count: chosen.length })}</Button>
            </div>
            <p className="hint">{settings.business.name ? "" : t("workflow.noBusinessName")}</p>
          </>
        )}
      </div>
    </Page>
  );
}

function CustomChooser() {
  const { svc, t } = useApp();
  const { data } = useData(() => svc.actions.segments(), []);
  return (
    <Page title={t("action.custom.title")} back>
      <div className="stack">
        <p className="muted">{t("action.custom.desc")}</p>
        {data && data.length === 0 ? <Empty icon={<MessageSquareText />} title={t("segment.none")} action={<Link className="btn primary" to="/actions/segment/new">{t("segment.new")}</Link>} /> : null}
        <div className="card flush list">{(data ?? []).map((s) => <Link key={s.id} className="list-row" to={`/actions/custom?segment=${s.id}`}><span className="grow strong">{s.name}</span></Link>)}</div>
      </div>
    </Page>
  );
}
