import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  Users, UserPlus, Clock, UserMinus, Crown, Gift, DollarSign, Repeat, RotateCcw, ChevronRight, Target,
} from "lucide-react";
import { C } from "../components/theme";
import { StatCard, Btn, EmptyState } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useCustomerOverview } from "../lib/useCustomerOverview";
import { useBusinessTable } from "../lib/useBusinessTable";
import { useRevenueEvents } from "../lib/useRevenueEvents";
import { formatMoney } from "../lib/currencies";

const PERIODS = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "3m", label: "3 Months" },
  { key: "6m", label: "6 Months" },
  { key: "12m", label: "12 Months" },
];

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

function PrimaryStat({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
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
    </div>
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
        {cta} <ChevronRight size={14} />
      </Btn>
    </div>
  );
}

function OpportunityRow({ label, count, potential, color }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <div className="text-sm font-semibold" style={{ color: C.ink }}>{label}</div>
        <div className="text-xs" style={{ color: C.slateLight }}>{count} customer{count === 1 ? "" : "s"}</div>
      </div>
      <div className="text-sm font-bold" style={{ color }}>{potential}</div>
    </div>
  );
}

export default function Dashboard() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("30d");

  const { rows, ready: customersReady } = useCustomerOverview(business?.id);
  const { rows: recoveryLeads, ready: recoveryReady } = useBusinessTable("recovery_opportunities", business?.id);
  const { rows: redemptions, ready: redemptionsReady } = useBusinessTable("reward_redemptions", business?.id);
  const { rows: revenueEvents, ready: revenueReady } = useRevenueEvents(business?.id);

  const ready = customersReady && recoveryReady && redemptionsReady && revenueReady;
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
    return <div className="p-8 text-sm" style={{ color: C.slateLight }}>Loading dashboard…</div>;
  }

  if (stats.total === 0) {
    return (
      <div className="p-8">
        <EmptyState
          title="No customers yet"
          subtitle="Import your customer list to see segments, recovery opportunities, and recommended actions appear here."
          action={<Btn onClick={() => navigate("/customers")}>Go to Customers</Btn>}
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Hero */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: C.ink }}>Turn More Customers Into Repeat Customers</h1>
        <p className="mt-1 text-sm" style={{ color: C.slateLight }}>
          SmartManager identifies which customers need attention and recommends the next best action.
        </p>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PrimaryStat label="Revenue Recovered" value={formatMoney(revenueStats.recoveredRevenue, currency)} icon={DollarSign} accent={C.green} />
        <PrimaryStat label="Customers Reactivated" value={revenueStats.reactivatedCustomers} icon={RotateCcw} accent={C.teal} />
        <PrimaryStat label="Customers Recovered" value={revenueStats.recoveredCustomers} icon={Target} accent={C.amber} />
        <PrimaryStat label="Retention Rate" value={`${revenueStats.retentionRate.toFixed(1)}%`} icon={Repeat} accent={C.navy} />
      </div>

      {/* Secondary metrics */}
      <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total Customers" value={stats.total} icon={Users} />
        <StatCard label="Active" value={stats.active} icon={Users} accent={C.green} />
        <StatCard label="New" value={stats.new} icon={UserPlus} accent={C.teal} />
        <StatCard label="Due for Return" value={stats.due} icon={Clock} accent={C.amber} />
        <StatCard label="Inactive" value={stats.inactive + stats.lost} icon={UserMinus} accent={C.red} />
        <StatCard label="VIP Customers" value={stats.vip} icon={Crown} accent={C.gold} />
        <StatCard label="Rewards Redeemed" value={redemptions.length} icon={Gift} accent={C.teal} />
      </div>

      {/* Today's Priority Actions */}
      {(stats.reactivationCandidates.length > 0 || openRecoveryLeads.length > 0 || stats.due > 0) && (
        <div className="mt-8">
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>Today's Priority Actions</h2>
          <div className="mt-3 space-y-2">
            {stats.reactivationCandidates.length > 0 && (
              <PriorityRow
                dot={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: C.red }} />}
                count={stats.reactivationCandidates.length}
                label="customers ready for reactivation"
                cta="View Customers"
                onClick={() => navigate("/reactivation")}
              />
            )}
            {openRecoveryLeads.length > 0 && (
              <PriorityRow
                dot={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: C.amber }} />}
                count={openRecoveryLeads.length}
                label="leads need recovery follow-up"
                cta="View Leads"
                onClick={() => navigate("/recovery")}
              />
            )}
            {stats.due > 0 && (
              <PriorityRow
                dot={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#D4B106" }} />}
                count={stats.due}
                label="customers due for return"
                cta="View Customers"
                onClick={() => navigate("/retention")}
              />
            )}
          </div>
        </div>
      )}

      {/* Revenue Opportunity + Customer Health */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: C.ink }}>Revenue Opportunity</h2>
            <span className="text-lg font-bold" style={{ color: C.green }}>{formatMoney(opportunity.total, currency)}</span>
          </div>
          <p className="mt-1 text-xs" style={{ color: C.slateLight }}>
            Based on these customers' historical spending — not a guarantee, but where the value is concentrated.
          </p>
          <div className="mt-2 divide-y" style={{ borderColor: C.border }}>
            <OpportunityRow label="Reactivation" count={opportunity.reactivation.count} potential={formatMoney(opportunity.reactivation.potential, currency)} color={C.red} />
            <OpportunityRow label="Recovery" count={opportunity.recovery.count} potential={formatMoney(opportunity.recovery.potential, currency)} color={C.amber} />
            <OpportunityRow label="Retention" count={opportunity.retention.count} potential={formatMoney(opportunity.retention.potential, currency)} color={C.teal} />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>Customer Health</h2>
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
                <span className="ml-auto text-xs font-bold" style={{ color: C.ink }}>{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue Recovered chart */}
      <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>Revenue Recovered</h2>
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
          <p className="mt-4 text-xs" style={{ color: C.slateLight }}>No revenue events logged yet — recover a lead or reactivate a customer to see this fill in.</p>
        ) : (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.slateLight }} axisLine={false} tickLine={false} interval={period === "30d" ? 4 : 0} />
                <YAxis tick={{ fontSize: 11, fill: C.slateLight }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatMoney(v, currency)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Reactivation" stackId="rev" fill={C.teal} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Recovery" stackId="rev" fill={C.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
