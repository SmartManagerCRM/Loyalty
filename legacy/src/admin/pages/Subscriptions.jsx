import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { C } from "../../components/theme";
import { Select } from "../../components/ui";
import { fetchBusinesses, fetchPlans, updateBusiness } from "../../lib/adminApi";
import { formatMoney } from "../../lib/currencies";

const PLAN_KEYS = ["trial", "starter", "growth", "professional", "enterprise"];
const STATUS_KEYS = ["trialing", "active", "past_due", "canceled"];

export default function Subscriptions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [plansByKey, setPlansByKey] = useState({});
  const [ready, setReady] = useState(false);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "all");
  const [planFilter, setPlanFilter] = useState(() => searchParams.get("plan") || "all");

  async function load() {
    const [b, p] = await Promise.all([fetchBusinesses(), fetchPlans({ includeInactive: true })]);
    setRows(b);
    setPlansByKey(Object.fromEntries(p.map((x) => [x.key, x])));
    setReady(true);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      (statusFilter === "all" || r.subscription_status === statusFilter) &&
      (planFilter === "all" || r.subscription_plan === planFilter)
    );
  }, [rows, statusFilter, planFilter]);

  async function handlePlanChange(businessId, newPlan) {
    await updateBusiness(businessId, { subscriptionPlan: newPlan });
    load();
  }
  async function handleStatusChange(businessId, newStatus) {
    await updateBusiness(businessId, { subscriptionStatus: newStatus });
    load();
  }

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("admin.common.loading")}</div>;

  return (
    <div className="p-8">
      <p className="text-sm" style={{ color: C.slateLight }}>{t("admin.subscriptions.subtitle")}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Select
          className="w-48"
          options={[{ value: "all", label: t("admin.subscriptions.filterAllStatuses") }, ...STATUS_KEYS.map((k) => ({ value: k, label: t(`admin.common.statuses.${k}`) }))]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Select
          className="w-48"
          options={[{ value: "all", label: t("admin.subscriptions.filterAllPlans") }, ...PLAN_KEYS.map((k) => ({ value: k, label: t(`settings.billing.plans.${k}`) }))]}
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: C.slateLight }}>{t("admin.subscriptions.empty")}</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
                <th className="px-4 py-3">{t("admin.subscriptions.columnBusiness")}</th>
                <th className="px-4 py-3">{t("admin.subscriptions.columnPlan")}</th>
                <th className="px-4 py-3">{t("admin.subscriptions.columnStatus")}</th>
                <th className="px-4 py-3">{t("admin.subscriptions.columnMrr")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const planRow = plansByKey[b.subscription_plan];
                const contributes = b.subscription_status === "active" && planRow?.price_monthly != null;
                return (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: C.ink }}>
                      <button onClick={() => navigate(`/admin/businesses/${b.id}`)} className="hover:underline">{b.name}</button>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        className="w-40"
                        options={PLAN_KEYS.map((k) => ({ value: k, label: t(`settings.billing.plans.${k}`) }))}
                        value={b.subscription_plan}
                        onChange={(e) => handlePlanChange(b.id, e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        className="w-36"
                        options={STATUS_KEYS.map((k) => ({ value: k, label: t(`admin.common.statuses.${k}`) }))}
                        value={b.subscription_status}
                        onChange={(e) => handleStatusChange(b.id, e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: contributes ? C.green : C.slateLight }}>
                      {contributes ? formatMoney(planRow.price_monthly, "USD") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
