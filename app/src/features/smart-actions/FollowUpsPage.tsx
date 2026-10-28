import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCheck, Plus } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Button, Card, Empty, Spinner } from "../../components/ui";
import { addDays, localDate } from "../../domain/dates";
import { CustomerPicker, FollowUpSheet } from "../customers/sheets";

export function FollowUpsPage() {
  const { svc, t, date, bump, fail } = useApp();
  const [picker, setPicker] = useState(false);
  const [forCustomer, setForCustomer] = useState<string | null>(null);
  const { data, loading } = useData(() => svc.actions.followUps({ status: "open" }), []);
  const today = localDate(new Date());
  const groups = [
    { key: "overdue", items: (data ?? []).filter((f) => f.dueOn < today) },
    { key: "today", items: (data ?? []).filter((f) => f.dueOn === today) },
    { key: "upcoming", items: (data ?? []).filter((f) => f.dueOn > today) },
  ];
  const act = async (fn: () => Promise<void>) => { try { await fn(); bump(); } catch (e) { fail(e); } };
  return (
    <Page title={t("followup.title")} back actions={<Button sm write onClick={() => setPicker(true)}><Plus />{t("followup.add")}</Button>}>
      <div className="stack-lg">
        {loading ? <Spinner /> : null}
        {data && data.length === 0 ? <Empty icon={<CheckCheck />} title={t("followup.emptyTitle")} text={t("followup.emptyText")} /> : null}
        {groups.map((g) => g.items.length ? (
          <section key={g.key} className="stack">
            <h2 className="section-title">{t(`followup.group.${g.key}`)} ({g.items.length})</h2>
            {g.items.map((f) => (
              <Card key={f.id}>
                <div className="stack">
                  <div className="row between"><Link to={`/customers/${f.customerId}`} className="strong" style={{ color: "inherit" }}>{f.customerName}</Link>
                    <Badge tone={g.key === "overdue" ? "danger" : g.key === "today" ? "warn" : ""}>{date(f.dueOn)}</Badge></div>
                  {f.note ? <p className="small">{f.note}</p> : null}
                  <div className="row wrap">
                    <Button sm variant="primary" write onClick={() => void act(() => svc.actions.setFollowUpStatus(f.id, "done"))}>{t("followup.done")}</Button>
                    <Button sm write onClick={() => void act(() => svc.actions.rescheduleFollowUp(f.id, addDays(today, 1)))}>{t("followup.tomorrow")}</Button>
                    <Button sm write onClick={() => void act(() => svc.actions.rescheduleFollowUp(f.id, addDays(today, 7)))}>{t("followup.nextWeek")}</Button>
                    <Button sm write onClick={() => void act(() => svc.actions.setFollowUpStatus(f.id, "dismissed"))}>{t("followup.dismiss")}</Button>
                  </div>
                </div>
              </Card>
            ))}
          </section>
        ) : null)}
      </div>
      {picker ? <CustomerPicker onClose={() => setPicker(false)} onPick={(c) => { setPicker(false); setForCustomer(c.id); }} /> : null}
      {forCustomer ? <FollowUpSheet customerId={forCustomer} onClose={() => setForCustomer(null)} /> : null}
    </Page>
  );
}
