import { Link } from "react-router-dom";
import { Bell, Cake, Crown, Gift, HeartHandshake, ListChecks, Plus, ShieldAlert, Sparkles, UserRoundX, Layers } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Banner, Card, Chevron, LinkButton, Spinner } from "../../components/ui";
import type { ActionType } from "../../domain/types";
import { localDate } from "../../domain/dates";

const ICON: Record<ActionType, typeof Bell> = { win_back: UserRoundX, prevent_churn: ShieldAlert, retain_vip: Crown, new_customer: HeartHandshake, birthday: Cake, points_reminder: Gift, custom: Layers };
const ORDER: ActionType[] = ["win_back", "prevent_churn", "retain_vip", "new_customer", "points_reminder", "birthday"];

export function ActionsHome() {
  const { svc, t, num, date } = useApp();
  const { data, loading } = useData(async () => {
    const insights = await svc.insights.loadAll();
    const [counts, segments, runs, follow] = await Promise.all([svc.actions.countsByType(insights), svc.actions.segments(), svc.actions.runs(10), svc.actions.followUps({ status: "open" })]);
    const today = localDate(new Date());
    return { counts, segments, runs, due: follow.filter((f) => f.dueOn <= today).length, open: follow.length };
  }, []);
  return (
    <Page title={t("nav.actions")} root>
      <div className="stack-lg">
        <Banner>{t("actions.honest")}</Banner>
        {loading ? <Spinner /> : null}
        {data ? (
          <>
            <Link to="/actions/followups" className="card link">
              <div className="row"><ListChecks color="var(--brand-deep)" /><div className="grow"><div className="strong">{t("followup.title")}</div>
                <div className="small muted">{data.due ? t("followup.dueSummary", { due: data.due, open: data.open }) : t("followup.openSummary", { open: data.open })}</div></div>
                {data.due ? <Badge tone="warn">{num(data.due)}</Badge> : null}<Chevron /></div>
            </Link>
            <h2 className="section-title">{t("actions.workflows")}</h2>
            <div className="stack">
              {ORDER.map((a) => {
                const Icon = ICON[a];
                return (
                  <Link key={a} to={`/actions/${a}`} className="card link">
                    <div className="row"><Icon color="var(--brand-deep)" style={{ flex: "none" }} />
                      <div className="grow"><div className="strong">{t(`action.${a}.title`)}</div><div className="small muted">{t(`action.${a}.desc`)}</div></div>
                      <Badge tone={data.counts[a] ? "brand" : ""}>{num(data.counts[a])}</Badge><Chevron /></div>
                  </Link>
                );
              })}
            </div>
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
