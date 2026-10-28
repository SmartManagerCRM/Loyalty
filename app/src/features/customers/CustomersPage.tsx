import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Upload, Users, Crown } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Chips, Empty, IconButton, Initials, LinkButton, ListRow, SearchBox, Spinner } from "../../components/ui";
import type { Band } from "../../domain/types";
import { useDebounced } from "./sheets";

type Filter = "all" | "active" | "new" | "at_risk" | "inactive" | "vip" | "dnc" | "archived";
export const BAND_TONE: Record<Band, "brand" | "warn" | "danger" | "info" | ""> = { new: "info", active: "brand", at_risk: "warn", inactive: "danger", no_purchases: "" };

export function CustomersPage() {
  const { svc, t, num } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const filter = (params.get("band") as Filter) || "all";
  const setFilter = (f: Filter) => setParams(f === "all" ? {} : { band: f }, { replace: true });

  const { data, loading } = useData(async () => {
    const customers = await svc.customers.list({ search: dq, onlyArchived: filter === "archived" });
    const insights = filter === "archived" ? [] : await svc.insights.loadAll();
    return { customers, byId: new Map(insights.map((i) => [i.id, i])) };
  }, [dq, filter]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.customers.filter((c) => {
      const i = data.byId.get(c.id);
      switch (filter) {
        case "active": return i?.band === "active" || i?.band === "new";
        case "new": return i?.band === "new";
        case "at_risk": return i?.band === "at_risk";
        case "inactive": return i?.band === "inactive";
        case "vip": return !!i?.isVip;
        case "dnc": return c.consent === "do_not_contact";
        default: return true;
      }
    });
  }, [data, filter]);

  const options: { value: Filter; label: string }[] = [
    { value: "all", label: t("filter.all") }, { value: "active", label: t("filter.active") }, { value: "new", label: t("band.new") },
    { value: "at_risk", label: t("band.at_risk") }, { value: "inactive", label: t("band.inactive") }, { value: "vip", label: t("filter.vip") },
    { value: "dnc", label: t("consent.do_not_contact") }, { value: "archived", label: t("filter.archived") },
  ];

  return (
    <Page title={t("nav.customers")} root actions={<IconButton label={t("customers.import")} onClick={() => nav("/customers/import")}><Upload /></IconButton>}>
      <div className="stack">
        <SearchBox value={q} onChange={setQ} placeholder={t("customers.search")} />
        <Chips value={filter} onChange={setFilter} options={options} />
        {loading ? <Spinner /> : null}
        {data && rows.length === 0 ? (
          <Empty icon={<Users />} title={q || filter !== "all" ? t("customers.noMatch") : t("customers.emptyTitle")} text={q || filter !== "all" ? undefined : t("customers.emptyText")}
            action={!q && filter === "all" ? <div className="row wrap" style={{ justifyContent: "center" }}><LinkButton to="/customers/new" variant="primary"><Plus />{t("customers.add")}</LinkButton><LinkButton to="/customers/import"><Upload />{t("customers.import")}</LinkButton></div> : undefined} />
        ) : null}
        {rows.length ? (
          <>
            <p className="small muted">{t("customers.count", { count: num(rows.length) })}</p>
            <div className="card flush list">
              {rows.map((c) => {
                const i = data!.byId.get(c.id);
                return (
                  <ListRow key={c.id} to={`/customers/${c.id}`} leading={<Initials name={c.name} gold={i?.isVip} />} title={c.name}
                    sub={<span className="ltr">{c.phone ?? c.email ?? c.code}</span>}
                    trailing={
                      i ? (
                        <div style={{ textAlign: "end" }} className="stack" >
                          <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                            {i.isVip ? <Badge tone="gold"><Crown size={12} />{i.tierName}</Badge> : null}
                            <Badge tone={BAND_TONE[i.band]}>{t(`band.${i.band}`)}</Badge>
                          </div>
                          <span className="tiny muted num">{t("customers.pointsShort", { points: num(i.pointsBalance) })}{i.daysSinceLast !== null ? ` · ${t("common.daysAgo", { days: i.daysSinceLast })}` : ""}</span>
                        </div>
                      ) : c.archivedAt ? <Badge>{t("filter.archived")}</Badge> : undefined
                    } />
                );
              })}
            </div>
          </>
        ) : null}
      </div>
      <button type="button" className="fab" aria-label={t("customers.add")} onClick={() => nav("/customers/new")}><Plus /></button>
    </Page>
  );
}
