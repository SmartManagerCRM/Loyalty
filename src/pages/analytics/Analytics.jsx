import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DollarSign, Users, RotateCcw, Repeat, Gift, Crown, Target, ShieldCheck, Wallet } from "lucide-react";
import { C } from "../../components/theme";
import { StatCard } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useCustomerOverview } from "../../lib/useCustomerOverview";
import { useBusinessTable } from "../../lib/useBusinessTable";
import { supabase } from "../../lib/supabaseClient";

const RECOVERY_STATUSES = ["New", "Contacted", "Interested", "Follow-up Required", "Converted", "Lost"];

function monthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString(undefined, { month: "short" });
}

function useRevenueEvents(businessId) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!businessId) return;
    supabase.from("revenue_events").select("*").eq("business_id", businessId).then(({ data }) => {
      setRows(data || []);
      setReady(true);
    });
  }, [businessId]);
  return { rows, ready };
}

export default function Analytics() {
  const { business } = useAuth();
  const { rows: customers, ready: customersReady } = useCustomerOverview(business?.id);
  const { rows: recoveryLeads, ready: recoveryReady } = useBusinessTable("recovery_opportunities", business?.id);
  const { rows: redemptions, ready: redemptionsReady } = useBusinessTable("reward_redemptions", business?.id);
  const { rows: revenueEvents, ready: revenueReady } = useRevenueEvents(business?.id);

  const ready = customersReady && recoveryReady && redemptionsReady && revenueReady;

  const stats = useMemo(() => {
    if (!ready) return null;

    const total = customers.length;
    const lost = customers.filter((c) => c.is_lost).length;
    const inactiveOrLost = customers.filter((c) => c.is_inactive || c.is_lost).length;
    const repeat = customers.filter((c) => Number(c.total_visits) > 1).length;
    const vipCustomers = customers.filter((c) => c.is_vip);

    const recoveredRevenue = revenueEvents.filter((e) => e.event_type === "recovered").reduce((s, e) => s + Number(e.amount), 0);
    const reactivatedRevenue = revenueEvents.filter((e) => e.event_type === "reactivated").reduce((s, e) => s + Number(e.amount), 0);
    const revenueFromOffers = revenueEvents.filter((e) => e.related_offer_id).reduce((s, e) => s + Number(e.amount), 0);
    const vipRevenueEvents = revenueEvents.filter((e) => e.event_type === "vip_revenue").reduce((s, e) => s + Number(e.amount), 0);

    const convertedLeads = recoveryLeads.filter((l) => l.status === "Converted").length;
    const contactedLeads = recoveryLeads.filter((l) => l.status !== "New").length;
    const openLeads = recoveryLeads.filter((l) => !["Converted", "Lost"].includes(l.status)).length;

    const reactivatedCustomerIds = new Set(revenueEvents.filter((e) => e.event_type === "reactivated").map((e) => e.customer_id));
    const reactivationRate = (inactiveOrLost + reactivatedCustomerIds.size) > 0
      ? (reactivatedCustomerIds.size / (inactiveOrLost + reactivatedCustomerIds.size)) * 100
      : 0;

    const retentionRate = total > 0 ? ((total - lost) / total) * 100 : 0;
    const repeatRate = total > 0 ? (repeat / total) * 100 : 0;
    const avgLTV = total > 0 ? customers.reduce((s, c) => s + Number(c.total_spending || 0), 0) / total : 0;
    const vipRevenue = vipCustomers.reduce((s, c) => s + Number(c.total_spending || 0), 0) + vipRevenueEvents;

    const funnel = RECOVERY_STATUSES.map((status) => ({ status, count: recoveryLeads.filter((l) => l.status === status).length }));

    const monthly = {};
    for (const e of revenueEvents) {
      if (e.event_type !== "recovered" && e.event_type !== "reactivated") continue;
      const key = monthKey(e.occurred_at);
      monthly[key] = (monthly[key] || 0) + Number(e.amount);
    }
    const months = Object.keys(monthly).sort().slice(-6);
    const monthlyChart = months.map((key) => ({ month: monthLabel(key), revenue: Math.round(monthly[key]) }));

    return {
      total, openLeads, contactedLeads, convertedLeads,
      recoveredRevenue: recoveredRevenue + reactivatedRevenue, revenueFromOffers, vipRevenue,
      reactivationRate, retentionRate, repeatRate, avgLTV, redemptionsCount: redemptions.length,
      funnel, monthlyChart,
    };
  }, [ready, customers, recoveryLeads, redemptions, revenueEvents]);

  if (!ready || !stats) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>Loading analytics…</div>;

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold" style={{ color: C.ink }}>Revenue Analytics</h1>
      <p className="mt-1 text-sm" style={{ color: C.slateLight }}>The business value this platform is generating — not just activity.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Revenue Recovered" value={`${business?.currency} ${stats.recoveredRevenue.toLocaleString()}`} icon={DollarSign} accent={C.green} />
        <StatCard label="Revenue from Offers" value={`${business?.currency} ${stats.revenueFromOffers.toLocaleString()}`} icon={Gift} accent={C.teal} />
        <StatCard label="VIP Revenue" value={`${business?.currency} ${Math.round(stats.vipRevenue).toLocaleString()}`} icon={Crown} accent={C.gold} />
        <StatCard label="Rewards Redeemed" value={stats.redemptionsCount} icon={Wallet} />
        <StatCard label="Recovery Opportunities (open)" value={stats.openLeads} icon={Target} accent={C.amber} />
        <StatCard label="Leads Contacted" value={stats.contactedLeads} icon={Users} />
        <StatCard label="Leads Converted" value={stats.convertedLeads} icon={RotateCcw} accent={C.green} />
        <StatCard label="Reactivation Rate" value={`${stats.reactivationRate.toFixed(1)}%`} icon={RotateCcw} accent={C.teal} sub="Reactivated ÷ (inactive+lost + reactivated)" />
        <StatCard label="Repeat Customer Rate" value={`${stats.repeatRate.toFixed(1)}%`} icon={Repeat} />
        <StatCard label="Retention Rate" value={`${stats.retentionRate.toFixed(1)}%`} icon={ShieldCheck} sub="(total − lost) ÷ total" />
        <StatCard label="Avg Customer Lifetime Value" value={`${business?.currency} ${Math.round(stats.avgLTV).toLocaleString()}`} icon={DollarSign} />
        <StatCard label="Total Customers" value={stats.total} icon={Users} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>Revenue Recovered by Month</h2>
          {stats.monthlyChart.length === 0 ? (
            <p className="mt-4 text-xs" style={{ color: C.slateLight }}>No revenue events logged yet — recover a lead or reactivate a customer to see this fill in.</p>
          ) : (
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.slateLight }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: C.slateLight }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [`${business?.currency} ${v.toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill={C.green} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>Recovery Funnel</h2>
          <div className="mt-4 space-y-2">
            {stats.funnel.map((f) => {
              const max = Math.max(1, ...stats.funnel.map((x) => x.count));
              return (
                <div key={f.status} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs" style={{ color: C.slate }}>{f.status}</span>
                  <div className="h-4 flex-1 rounded-full" style={{ backgroundColor: C.bg }}>
                    <div className="h-4 rounded-full" style={{ width: `${(f.count / max) * 100}%`, backgroundColor: C.teal }} />
                  </div>
                  <span className="w-6 text-right text-xs font-semibold" style={{ color: C.ink }}>{f.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
