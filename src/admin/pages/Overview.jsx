import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, Hourglass, CheckCircle2, AlertTriangle, XCircle, UserPlus, DollarSign, ChevronRight, TrendingUp, PieChart } from "lucide-react";
import { C } from "../../components/theme";
import { StatCard, Btn } from "../../components/ui";
import { fetchOverviewStats, fetchBusinesses } from "../../lib/adminApi";
import { formatMoney } from "../../lib/currencies";

function daysLeft(dateStr) {
  return Math.ceil((new Date(dateStr) - Date.now()) / 86400000);
}

export default function Overview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([fetchOverviewStats(), fetchBusinesses()]).then(([s, b]) => {
      setStats(s);
      setBusinesses(b);
      setReady(true);
    });
  }, []);

  const trialsEndingSoon = useMemo(() => {
    return businesses
      .filter((b) => b.subscription_status === "trialing" && daysLeft(b.trial_ends_at) <= 7)
      .sort((a, b) => new Date(a.trial_ends_at) - new Date(b.trial_ends_at));
  }, [businesses]);

  if (!ready || !stats) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("admin.common.loading")}</div>;

  return (
    <div className="p-8">
      <p className="max-w-2xl text-sm" style={{ color: C.slateLight }}>{t("admin.overview.subtitle")}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.overview.kpi.totalBusinesses")} value={stats.total_businesses} icon={Building2} to="/admin/businesses" />
        <StatCard label={t("admin.overview.kpi.active")} value={stats.active_count} icon={CheckCircle2} accent={C.green} to="/admin/subscriptions?status=active" />
        <StatCard label={t("admin.overview.kpi.trialing")} value={stats.trialing_count} icon={Hourglass} accent={C.amber} to="/admin/trials" />
        <StatCard label={t("admin.overview.kpi.mrr")} value={formatMoney(stats.mrr, "USD")} icon={DollarSign} accent={C.green} to="/admin/subscriptions?status=active" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t("admin.overview.kpi.pastDue")} value={stats.past_due_count} icon={AlertTriangle} accent={C.red} to="/admin/subscriptions?status=past_due" />
        <StatCard label={t("admin.overview.kpi.canceled")} value={stats.canceled_count} icon={XCircle} accent={C.slateLight} to="/admin/subscriptions?status=canceled" />
        <StatCard label={t("admin.overview.kpi.signups30d")} value={stats.signups_last_30d} icon={UserPlus} accent={C.teal} to="/admin/businesses" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t("admin.overview.kpi.arr")} value={formatMoney(stats.arr, "USD")} icon={TrendingUp} accent={C.green} to="/admin/subscriptions?status=active" />
        <StatCard label={t("admin.overview.kpi.conversion")} value={`${stats.trial_to_paid_conversion_pct ?? 0}%`} icon={PieChart} accent={C.teal} to="/admin/trials" />
      </div>

      {(stats.revenue_by_plan || []).length > 0 && (
        <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>{t("admin.overview.revenueByPlan")}</h2>
          <div className="mt-3 space-y-2">
            {stats.revenue_by_plan.map((row) => (
              <Link
                key={row.plan}
                to={`/admin/subscriptions?plan=${row.plan}`}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-black/[0.03]"
                style={{ backgroundColor: C.bg }}
              >
                <div className="text-sm font-semibold capitalize" style={{ color: C.ink }}>{row.plan}</div>
                <div className="flex items-center gap-4 text-xs" style={{ color: C.slateLight }}>
                  <span>{t("admin.overview.subscribers", { count: row.subscribers })}</span>
                  <span className="font-bold" style={{ color: C.ink }}>{formatMoney(row.mrr, "USD")}{t("admin.plans.perMonth")}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>{t("admin.overview.trialsEndingSoon")}</h2>
          <Btn variant="secondary" onClick={() => navigate("/admin/trials")}>{t("admin.overview.viewAll")} <ChevronRight size={14} className="rtl:rotate-180" /></Btn>
        </div>
        {trialsEndingSoon.length === 0 ? (
          <p className="mt-3 text-xs" style={{ color: C.slateLight }}>{t("admin.overview.noTrialsEndingSoon")}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {trialsEndingSoon.map((b) => {
              const dl = daysLeft(b.trial_ends_at);
              return (
                <div
                  key={b.id}
                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 hover:bg-black/[0.02]"
                  style={{ backgroundColor: C.bg }}
                  onClick={() => navigate(`/admin/businesses/${b.id}`)}
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.ink }}>{b.name}</div>
                    <div className="text-xs" style={{ color: C.slateLight }}>{b.owner_email}</div>
                  </div>
                  <span className="text-xs font-bold" style={{ color: dl <= 2 ? C.red : C.amber }}>
                    {dl <= 0 ? t("admin.trials.expired") : t("admin.trials.daysLeft", { count: dl })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
