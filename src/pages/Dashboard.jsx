import React, { useEffect, useMemo, useState } from "react";
import {
  Users, UserPlus, Clock, UserMinus, Target, Crown, Gift, TrendingUp, Repeat, DollarSign, MessageCircle,
} from "lucide-react";
import { C } from "../components/theme";
import { StatCard, Btn, EmptyState, Pill } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useCustomerOverview } from "../lib/useCustomerOverview";
import { nextBestAction, segmentMeta } from "../lib/segmentation";
import { generateMessage } from "../lib/messageTemplates";
import { openWhatsApp } from "../lib/whatsapp";
import { supabase } from "../lib/supabaseClient";
import { formatMoney } from "../lib/currencies";

function useRevenueRecovered(businessId) {
  const [total, setTotal] = useState(0);
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [redemptions, setRedemptions] = useState(0);
  const [openRecovery, setOpenRecovery] = useState(0);

  useEffect(() => {
    if (!businessId) return;
    (async () => {
      const [rev, redeem, recovery] = await Promise.all([
        supabase.from("revenue_events").select("amount, event_type").eq("business_id", businessId).in("event_type", ["recovered", "reactivated"]),
        supabase.from("reward_redemptions").select("id", { count: "exact", head: true }).eq("business_id", businessId),
        supabase.from("recovery_opportunities").select("id", { count: "exact", head: true }).eq("business_id", businessId).not("status", "in", "(Converted,Lost)"),
      ]);
      if (rev.data) {
        setTotal(rev.data.reduce((sum, r) => sum + Number(r.amount || 0), 0));
        setRecoveredCount(rev.data.length);
      }
      setRedemptions(redeem.count || 0);
      setOpenRecovery(recovery.count || 0);
    })();
  }, [businessId]);

  return { total, recoveredCount, redemptions, openRecovery };
}

export default function Dashboard() {
  const { business } = useAuth();
  const { rows, ready } = useCustomerOverview(business?.id);
  const { total: revenueRecovered, recoveredCount, redemptions, openRecovery } = useRevenueRecovered(business?.id);

  const stats = useMemo(() => {
    const s = {
      total: rows.length, active: 0, new: 0, due: 0, inactive: 0, lost: 0, vip: 0, repeat: 0,
    };
    for (const r of rows) {
      if (r.is_active) s.active++;
      if (r.is_new) s.new++;
      if (r.is_due) s.due++;
      if (r.is_inactive) s.inactive++;
      if (r.is_lost) s.lost++;
      if (r.is_vip) s.vip++;
      if (Number(r.total_visits) > 1) s.repeat++;
    }
    return s;
  }, [rows]);

  const repeatRate = stats.total > 0 ? Math.round((stats.repeat / stats.total) * 100) : 0;

  const recommended = useMemo(() => {
    return rows
      .map((r) => ({ row: r, nba: nextBestAction(r, { visitLabel: business?.visit_label }) }))
      .filter((x) => x.nba && x.nba.priority !== "none")
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.nba.priority] - order[b.nba.priority];
      })
      .slice(0, 8);
  }, [rows, business]);

  if (!ready) {
    return <div className="p-8 text-sm" style={{ color: C.slateLight }}>Loading dashboard…</div>;
  }

  if (stats.total === 0) {
    return (
      <div className="p-8">
        <EmptyState
          title="No customers yet"
          subtitle="Import your customer list to see segments, recovery opportunities, and recommended actions appear here."
          action={<Btn onClick={() => (window.location.href = "/customers")}>Go to Customers</Btn>}
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Customers" value={stats.total} icon={Users} />
        <StatCard label="Active" value={stats.active} icon={TrendingUp} accent={C.green} />
        <StatCard label="New" value={stats.new} icon={UserPlus} accent={C.teal} />
        <StatCard label="Due for Return" value={stats.due} icon={Clock} accent={C.amber} />
        <StatCard label="Inactive" value={stats.inactive + stats.lost} icon={UserMinus} accent={C.red} />
        <StatCard label="Recovery Opportunities" value={openRecovery} icon={Target} accent={C.amber} />
        <StatCard label="VIP Customers" value={stats.vip} icon={Crown} accent={C.gold} />
        <StatCard label="Rewards Redeemed" value={redemptions} icon={Gift} accent={C.teal} />
        <StatCard label="Revenue Recovered" value={formatMoney(revenueRecovered, business?.currency)} icon={DollarSign} accent={C.green} sub={`${recoveredCount} events`} />
        <StatCard label="Repeat Customer Rate" value={`${repeatRate}%`} icon={Repeat} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-bold" style={{ color: C.ink }}>Today's Recommended Actions</h2>
        {recommended.length === 0 ? (
          <p className="mt-2 text-xs" style={{ color: C.slateLight }}>Nothing needs attention right now — everyone is on a healthy cycle.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {recommended.map(({ row, nba }) => {
              const seg = segmentMeta(
                row.is_lost ? "lost" : row.is_inactive ? "inactive" : row.is_at_risk ? "at_risk" : row.is_due ? "due" : row.is_vip ? "vip" : "active"
              );
              return (
                <div key={row.customer_id} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold" style={{ color: C.ink }}>{row.name}</div>
                      <div className="text-xs" style={{ color: C.slateLight }}>
                        Last {business?.visit_label?.toLowerCase() || "visit"}: {row.days_since_last_visit != null ? `${row.days_since_last_visit} days ago` : "never"} · {formatMoney(row.total_spending, business?.currency)}
                      </div>
                    </div>
                    {seg && <Pill color={seg.color} bg={`${seg.color}1a`}>{seg.label}</Pill>}
                  </div>
                  <div className="mt-3 rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg }}>
                    <div className="font-bold" style={{ color: C.navy }}>{nba.action}</div>
                    <div className="mt-1" style={{ color: C.slate }}>{nba.reason}</div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Btn
                      icon={MessageCircle}
                      onClick={() => openWhatsApp(row.phone, generateMessage({
                        action: nba.action,
                        customerName: row.name,
                        businessName: business?.name,
                        days: row.days_since_last_visit,
                        language: business?.default_language,
                      }))}
                      disabled={!row.phone}
                    >
                      Open WhatsApp
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
