import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  Users, UserPlus, Clock, UserMinus, Crown, Gift, DollarSign, Repeat, RotateCcw, ChevronRight, Target, CheckCircle2, CalendarClock, Ticket,
} from "lucide-react";
import { C } from "../components/theme";
import { StatCard, Btn, EmptyState } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useCustomerOverview } from "../lib/useCustomerOverview";
import { useBusinessTable } from "../lib/useBusinessTable";
import { useRevenueEvents } from "../lib/useRevenueEvents";
import { useMembershipsOverview } from "../lib/useMembershipsOverview";
import { formatMoney } from "../lib/currencies";

const PERIOD_KEYS = ["7d", "30d", "3m", "6m", "12m"];

function pad(n) { return String(n).padStart(2, "0"); }
function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

// Buckets revenue_events (recovered + reactivated only — the two event
// types that make up "Revenue Recovered") into a chart series for the
// selected period. Daily buckets for 7d/30d, monthly for 3m/6m/12m —
// a 90-bar daily chart for the 3-month view would be unreadable.
function bucketRevenue(events, periodKey) {
  const now = new Date();
  const buckets = [];
  const daily = periodKey === "7d" || periodKey === "30d";
  const count = { "7d": 7, "30d": 30, "3m": 3, "6m": 6, "12m": 12 }[periodKey];

  for (let i = count - 1; i >= 0; i--) {
    if (daily) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      buckets.push({ key: dayKey(d), label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), Reactivation: 0, Recovery: 0 });
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: monthKey(d), label: d.toLocaleDateString(undefined, { month: "short" }), Reactivation: 0, Recovery: 0 });
    }
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

  for (const e of events) {
    if (e.event_type !== "recovered" && e.event_type !== "reactivated") continue;
    const d = new Date(e.occurred_at);
    const key = daily ? dayKey(d) : monthKey(d);
    const bucket = byKey[key];
    if (!bucket) continue;
    bucket[e.event_type === "reactivated" ? "Reactivation" : "Recovery"] += Number(e.amount);
  }
  return buckets;
}

function PrimaryStat({ label, value, sub, icon: Icon, accent, to }) {
  const Tag = to ? Link : "div";
  return (
    <Tag
      {...(to ? { to } : {})}
      className={`block rounded-2xl bg-white p-5 shadow-sm transition-all ${to ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""}`}
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: C.slateLight }}>{label}</span>
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}1a` }}>
            <Icon size={18} color={accent} />
          </div>
        )}
      </div>
      <div className="mt-2 break-words text-2xl font-bold md:text-3xl" style={{ color: C.ink }}>{value}</div>
      {sub && <div className="mt-1 text-xs" style={{ color: C.slateLight }}>{sub}</div>}
    </Tag>
  );
}

function PriorityRow({ dot, count, label, cta, onClick }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-3">
        {dot}
        <span className="text-sm" style={{ color: C.ink }}>
          <strong>{count}</strong> {label}
        </span>
      </div>
      <Btn variant="secondary" onClick={onClick}>
        {cta} <ChevronRight size={14} className="rtl:rotate-180" />
      </Btn>
    </div>
  );
}

function OpportunityRow({ label, count, potential, color, t, to }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-lg py-2.5 -mx-2 px-2 transition-colors hover:bg-black/[0.03]">
      <div>
        <div className="text-sm font-semibold" style={{ color: C.ink }}>{label}</div>
        <div className="text-xs" style={{ color: C.slateLight }}>{t("common.customer", { count })}</div>
      </div>
      <div className="text-sm font-bold" style={{ color }}>{potential}</div>
    </Link>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { business } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("30d");
  const PERIODS = PERIOD_KEYS.map((key) => ({ key, label: t(`dashboard.periods.${key}`) }));

  const { rows, ready: customersReady } = useCustomerOverview(business?.id);
  const { rows: recoveryLeads, ready: recoveryReady } = useBusinessTable("recovery_opportunities", business?.id);
  const { rows: redemptions, ready: redemptionsReady } = useBusinessTable("reward_redemptions", business?.id);
  const { rows: revenueEvents, ready: revenueReady } = useRevenueEvents(business?.id);
  const { rows: bookings, ready: bookingsReady } = useBusinessTable("bookings", business?.id);
  const { rows: memberships, ready: membershipsReady } = useMembershipsOverview(business?.id);

  const ready = customersReady && recoveryReady && redemptionsReady && revenueReady && bookingsReady && membershipsReady;

  const bookingsToday = useMemo(() => {
    const now = new Date();
    return bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      const d = new Date(b.start_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    }).length;
  }, [bookings]);

  const membershipsNeedingAttention = useMemo(
    () => memberships.filter((m) => m.is_expiring_soon || m.is_unused).length,
    [memberships]
  );
  const currency = business?.currency;

  const stats = useMemo(() => {
    const s = {
      total: rows.length, active: 0, new: 0, due: 0, atRisk: 0, inactive: 0, lost: 0, vip: 0,
      reactivationCandidates: [], retentionCandidates: [],
    };
    for (const r of rows) {
      if (r.is_active) s.active++;
      if (r.is_new) s.new++;
      if (r.is_due) s.due++;
      if (r.is_at_risk) s.atRisk++;
      if (r.is_inactive) s.inactive++;
      if (r.is_lost) s.lost++;
      if (r.is_vip) s.vip++;
      if (r.is_inactive || r.is_lost) s.reactivationCandidates.push(r);
      if (r.is_due || r.is_at_risk) s.retentionCandidates.push(r);
    }
    return s;
  }, [rows]);

  const openRecoveryLeads = useMemo(
    () => recoveryLeads.filter((l) => !["Converted", "Lost"].includes(l.status)),
    [recoveryLeads]
  );

  const revenueStats = useMemo(() => {
    const recovered = revenueEvents.filter((e) => e.event_type === "recovered");
    const reactivated = revenueEvents.filter((e) => e.event_type === "reactivated");
    const recoveredRevenue = [...recovered, ...reactivated].reduce((sum, e) => sum + Number(e.amount), 0);
    const reactivatedCustomers = new Set(reactivated.map((e) => e.customer_id)).size;
    const recoveredCustomers = recoveryLeads.filter((l) => l.status === "Converted").length;
    const retentionRate = stats.total > 0 ? ((stats.total - stats.lost) / stats.total) * 100 : 0;
    return { recoveredRevenue, reactivatedCustomers, recoveredCustomers, retentionRate };
  }, [revenueEvents, recoveryLeads, stats]);

  const opportunity = useMemo(() => {
    const reactivationPotential = stats.reactivationCandidates.reduce((s, c) => s + Number(c.total_spending || 0), 0);
    const recoveryPotential = openRecoveryLeads.reduce((s, l) => s + Number(l.estimated_value || 0), 0);
    const retentionPotential = stats.retentionCandidates.reduce((s, c) => s + Number(c.total_spending || 0), 0);
    return {
      reactivation: { count: stats.reactivationCandidates.length, potential: reactivationPotential },
      recovery: { count: openRecoveryLeads.length, potential: recoveryPotential },
      retention: { count: stats.retentionCandidates.length, potential: retentionPotential },
      total: reactivationPotential + recoveryPotential + retentionPotential,
    };
  }, [stats, openRecoveryLeads]);

  const healthBuckets = useMemo(() => {
    const inactive = stats.inactive + stats.lost;
    const known = stats.active + stats.due + stats.atRisk + inactive;
    return [
      { label: "Active", count: stats.active, color: C.green },
      { label: "Due", count: stats.due, color: C.amber },
      { label: "At Risk", count: stats.atRisk, color: "#C77D14" },
      { label: "Inactive", count: inactive, color: C.red },
    ].map((b) => ({ ...b, pct: known > 0 ? (b.count / known) * 100 : 0 }));
  }, [stats]);

  const chartData = useMemo(() => bucketRevenue(revenueEvents, period), [revenueEvents, period]);

  if (!ready) {
    return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("dashboard.loading")}</div>;
  }

  if (stats.total === 0) {
    return (
      <div className="p-8">
        <EmptyState
          title={t("dashboard.empty.title")}
          subtitle={t("dashboard.empty.subtitle")}
          action={<Btn onClick={() => navigate("/customers")}>{t("dashboard.empty.cta")}</Btn>}
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Hero */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: C.ink }}>{t("dashboard.heroTitle")}</h1>
        <p className="mt-1 text-sm" style={{ color: C.slateLight }}>
          {t("dashboard.heroSubtitle")}
        </p>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PrimaryStat label={t("dashboard.kpi.revenueRecovered")} value={formatMoney(revenueStats.recoveredRevenue, currency)} icon={DollarSign} accent={C.green} to="/analytics" />
        <PrimaryStat label={t("dashboard.kpi.customersReactivated")} value={revenueStats.reactivatedCustomers} icon={RotateCcw} accent={C.teal} to="/reactivation" />
        <PrimaryStat label={t("dashboard.kpi.customersRecovered")} value={revenueStats.recoveredCustomers} icon={Target} accent={C.amber} to="/recovery" />
        <PrimaryStat label={t("dashboard.kpi.retentionRate")} value={`${revenueStats.retentionRate.toFixed(1)}%`} icon={Repeat} accent={C.navy} to="/retention" />
      </div>

      {/* Secondary metrics */}
      <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-9">
        <StatCard label={t("dashboard.kpi.totalCustomers")} value={stats.total} icon={Users} accent={C.navy} to="/customers" />
        <StatCard label={t("dashboard.kpi.bookingsToday")} value={bookingsToday} icon={CalendarClock} accent={C.teal} to="/bookings" />
        <StatCard label={t("dashboard.kpi.membershipsAttention")} value={membershipsNeedingAttention} icon={Ticket} accent={C.amber} to="/memberships" />
        <StatCard label={t("dashboard.kpi.active")} value={stats.active} icon={Users} accent={C.green} to="/customers" />
        <StatCard label={t("dashboard.kpi.new")} value={stats.new} icon={UserPlus} accent={C.teal} to="/customers" />
        <StatCard label={t("dashboard.kpi.dueForReturn")} value={stats.due} icon={Clock} accent={C.amber} to="/retention" />
        <StatCard label={t("dashboard.kpi.inactive")} value={stats.inactive + stats.lost} icon={UserMinus} accent={C.red} to="/reactivation" />
        <StatCard label={t("dashboard.kpi.vipCustomers")} value={stats.vip} icon={Crown} accent={C.gold} to="/vip" />
        <StatCard label={t("dashboard.kpi.rewardsRedeemed")} value={redemptions.length} icon={Gift} accent={C.greenDeep} to="/rewards" />
      </div>

      {/* Today's Priority Actions */}
      <div className="mt-8">
        <h2 className="text-sm font-bold" style={{ color: C.ink }}>{t("dashboard.priorityActions.title")}</h2>
        {stats.reactivationCandidates.length === 0 && openRecoveryLeads.length === 0 && stats.due === 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white p-4 text-sm shadow-sm" style={{ border: `1px solid ${C.border}`, color: C.slate }}>
            <CheckCircle2 size={16} color={C.green} />
            {t("dashboard.priorityActions.allCaughtUp")}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {stats.reactivationCandidates.length > 0 && (
              <PriorityRow
                dot={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: C.red }} />}
                count={stats.reactivationCandidates.length}
                label={t("dashboard.priorityActions.reactivation")}
                cta={t("dashboard.priorityActions.viewCustomers")}
                onClick={() => navigate("/reactivation")}
              />
            )}
            {openRecoveryLeads.length > 0 && (
              <PriorityRow
                dot={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: C.amber }} />}
                count={openRecoveryLeads.length}
                label={t("dashboard.priorityActions.recovery")}
                cta={t("dashboard.priorityActions.viewLeads")}
                onClick={() => navigate("/recovery")}
              />
            )}
            {stats.due > 0 && (
              <PriorityRow
                dot={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#D4B106" }} />}
                count={stats.due}
                label={t("dashboard.priorityActions.due")}
                cta={t("dashboard.priorityActions.viewCustomers")}
                onClick={() => navigate("/retention")}
              />
            )}
          </div>
        )}
      </div>

      {/* Revenue Opportunity + Customer Health */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: C.ink }}>{t("dashboard.opportunity.title")}</h2>
            <span className="text-lg font-bold" style={{ color: C.green }}>{formatMoney(opportunity.total, currency)}</span>
          </div>
          <p className="mt-1 text-xs" style={{ color: C.slateLight }}>
            {t("dashboard.opportunity.subtitle")}
          </p>
          <div className="mt-2 divide-y" style={{ borderColor: C.border }}>
            <OpportunityRow t={t} to="/reactivation" label={t("dashboard.opportunity.reactivation")} count={opportunity.reactivation.count} potential={formatMoney(opportunity.reactivation.potential, currency)} color={C.red} />
            <OpportunityRow t={t} to="/recovery" label={t("dashboard.opportunity.recovery")} count={opportunity.recovery.count} potential={formatMoney(opportunity.recovery.potential, currency)} color={C.amber} />
            <OpportunityRow t={t} to="/retention" label={t("dashboard.opportunity.retention")} count={opportunity.retention.count} potential={formatMoney(opportunity.retention.potential, currency)} color={C.teal} />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>{t("dashboard.health.title")}</h2>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full" style={{ backgroundColor: C.bg }}>
            {healthBuckets.map((b) => b.pct > 0 && (
              <div key={b.label} style={{ width: `${b.pct}%`, backgroundColor: b.color }} title={`${b.label}: ${b.count}`} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {healthBuckets.map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="text-xs" style={{ color: C.slate }}>{b.label}</span>
                <span className="ms-auto text-xs font-bold" style={{ color: C.ink }}>{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue Recovered chart */}
      <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>{t("dashboard.chart.title")}</h2>
          <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: C.bg }}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{ backgroundColor: period === p.key ? C.white : "transparent", color: period === p.key ? C.ink : C.slateLight, boxShadow: period === p.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {revenueEvents.length === 0 ? (
          <p className="mt-4 text-xs" style={{ color: C.slateLight }}>{t("dashboard.chart.empty")}</p>
        ) : (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.slateLight }} axisLine={false} tickLine={false} interval={period === "30d" ? 4 : 0} />
                <YAxis tick={{ fontSize: 11, fill: C.slateLight }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatMoney(v, currency)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Reactivation" name={t("dashboard.chart.reactivation")} stackId="rev" fill={C.teal} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Recovery" name={t("dashboard.chart.recovery")} stackId="rev" fill={C.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
