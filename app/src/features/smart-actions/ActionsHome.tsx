import { Link } from "react-router-dom";
import { Bell, Cake, Crown, Gift, HeartHandshake, ListChecks, MessageCircle, Plus, ShieldAlert, Sparkles, UserRoundX, Layers } from "lucide-react";
import { useState } from "react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Banner, Card, Chevron, Initials, LinkButton, Spinner } from "../../components/ui";
import type { ActionType } from "../../domain/types";
import { localDate } from "../../domain/dates";

const ICON: Record<ActionType, typeof Bell> = { win_back: UserRoundX, prevent_churn: ShieldAlert, retain_vip: Crown, new_customer: HeartHandshake, birthday: Cake, points_reminder: Gift, custom: Layers };

type Chip = "all" | "at_risk" | "inactive" | "rewards" | "vip";
const CARDS: { type: ActionType; chip: Chip; tone: "red" | "blue" | "orange" | "green"; cta: string }[] = [
  { type: "prevent_churn", chip: "at_risk", tone: "red", cta: "actions.review" },
  { type: "win_back", chip: "inactive", tone: "blue", cta: "actions.createOffer" },
  { type: "points_reminder", chip: "rewards", tone: "orange", cta: "actions.viewCustomers" },
  { type: "retain_vip", chip: "vip", tone: "green", cta: "actions.createOffer" },
  { type: "new_customer", chip: "all", tone: "green", cta: "actions.start" },
  { type: "birthday", chip: "all", tone: "orange", cta: "actions.start" },
];

export function ActionsHome() {
  const { svc, t, num, date, lang } = useApp();
  const [chip, setChip] = useState<Chip>("all");
  const { data, loading } = useData(async () => {
    const insights = await svc.insights.loadAll();
    const [segments, runs, follow, templates] = await Promise.all([svc.actions.segments(), svc.actions.runs(10), svc.actions.followUps({ status: "open" }), svc.actions.templates({ language: lang })]);
    const lists = new Map<ActionType, { names: string[]; count: number }>();
    for (const c of CARDS) {
      const rows = (await svc.actions.eligible(c.type, { insights })).filter((r) => !r.candidate.blocked);
      lists.set(c.type, { count: rows.length, names: rows.slice(0, 3).map((r) => r.insight.name) });
    }
    const today = localDate(new Date());
    return { lists, segments, runs, due: follow.filter((f) => f.dueOn <= today).length, open: follow.length, templates };
  }, [lang]);
  const shown = CARDS.filter((c) => chip === "all" || c.chip === chip);
  const chips: { v: Chip; l: string }[] = [{ v: "all", l: t("actions.all") }, { v: "at_risk", l: t("band.at_risk") }, { v: "inactive", l: t("band.inactive") }, { v: "rewards", l: t("nav.loyaltyShort") }, { v: "vip", l: "VIP" }];
  return (
    <Page title={t("nav.actions")} root>
      <div className="stack-lg">
        <div className="pill-tabs" role="tablist">{chips.map((c) => <button key={c.v} role="tab" aria-selected={chip === c.v} className={chip === c.v ? "on" : ""} onClick={() => setChip(c.v)}>{c.l}</button>)}</div>
        <Banner>{t("actions.honest")}</Banner>
        {loading ? <Spinner /> : null}
        {data ? (
          <>
            <div className="stack">
              {shown.map((c) => {
                const Icon = ICON[c.type];
                const l = data.lists.get(c.type)!;
                return (
                  <div key={c.type} className={`acard ${c.tone}`}>
                    <Link to={`/actions/${c.type}`} className="top" style={{ color: "inherit" }}>
                      <span className="ico"><Icon /></span>
                      <div className="grow"><h3>{t(`action.${c.type}.title`)}</h3><p className="small muted">{t(`action.${c.type}.desc`)}</p></div>
                      <Chevron />
                    </Link>
                    <div className="foot">
                      <div className="avatars">{l.names.map((n) => <Initials key={n} name={n} />)}{l.count > 3 ? <span className="more">+{num(l.count - 3)}</span> : null}{l.count === 0 ? <span className="small muted">0</span> : null}</div>
                      <Link to={`/actions/${c.type}`} className={`cta ${c.tone}`}>{t(c.cta)} · {num(l.count)}</Link>
                    </div>
                  </div>
                );
              })}
            </div>
            <Link to="/actions/followups" className="card link">
              <div className="row"><ListChecks color="var(--brand-deep)" /><div className="grow"><div className="strong">{t("followup.title")}</div>
                <div className="small muted">{data.due ? t("followup.dueSummary", { due: data.due, open: data.open }) : t("followup.openSummary", { open: data.open })}</div></div>
                {data.due ? <Badge tone="warn">{num(data.due)}</Badge> : null}<Chevron /></div>
            </Link>
            {data.templates.length ? (
              <section className="stack"><div className="row between"><h2 className="section-title">{t("actions.suggested")}</h2><Link to="/settings/templates" className="small">{t("common.seeAll")}</Link></div>
                <div className="card flush list">{data.templates.slice(0, 2).map((x) => <Link key={x.id} to={`/actions/${x.actionType}`} className="list-row"><MessageCircle color="var(--brand)" /><div className="grow"><div className="strong">{x.name}</div><div className="small muted ellipsis">{x.body}</div></div><Chevron /></Link>)}</div></section>
            ) : null}
            <div className="row between"><h2 className="section-title">{t("actions.segments")}</h2><LinkButton to="/actions/segment/new" sm><Plus />{t("segment.new")}</LinkButton></div>
            {data.segments.length === 0 ? <p className="muted small">{t("segment.none")}</p> : (
              <div className="card flush list">
                {data.segments.map((s) => (
                  <Link key={s.id} to={`/actions/custom?segment=${s.id}`} className="list-row"><Sparkles color="var(--brand-deep)" size={20} /><div className="grow strong">{s.name}</div>
                    <LinkButton to={`/actions/segment/${s.id}`} sm variant="ghost">{t("common.edit")}</LinkButton></Link>
                ))}
              </div>
            )}
            <h2 className="section-title">{t("actions.history")}</h2>
            {data.runs.length === 0 ? <p className="muted small">{t("actions.noHistory")}</p> : (
              <div className="card flush list">
                {data.runs.map((r) => (
                  <Link key={r.id} to={`/actions/run/${r.id}`} className="list-row">
                    <div className="grow"><div className="strong">{r.name}</div>
                      <div className="small muted">{date(r.createdAt, true)} · {t("actions.runSummary", { total: r.total, contacted: (r.counts.contacted ?? 0) + (r.counts.replied ?? 0) + (r.counts.returned ?? 0) + (r.counts.not_interested ?? 0), returned: r.counts.returned ?? 0 })}</div></div><Chevron />
                  </Link>
                ))}
              </div>
            )}
            <Card><p className="small muted">{t("actions.scoringNote")}</p></Card>
          </>
        ) : null}
      </div>
    </Page>
  );
}
