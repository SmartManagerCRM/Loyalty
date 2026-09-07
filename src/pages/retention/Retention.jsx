import React, { useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, EmptyState, Pill } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useCustomerOverview } from "../../lib/useCustomerOverview";
import { nextBestAction, churnRiskScore } from "../../lib/segmentation";
import { generateMessage } from "../../lib/messageTemplates";
import { openWhatsApp } from "../../lib/whatsapp";

function CustomerRow({ row, visitLabel, business, badge }) {
  const nba = nextBestAction(row, { visitLabel });
  const risk = churnRiskScore(row);
  const dueInDays = row.avg_return_cycle_days ? Math.round(row.avg_return_cycle_days - (row.days_since_last_visit || 0)) : null;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: C.ink }}>{row.name}</span>
            {badge}
            {risk && <Pill color={risk.score >= 50 ? C.red : C.slate} bg={risk.score >= 50 ? "#C63B3B1a" : C.bg}>Risk {risk.score}</Pill>}
          </div>
          <div className="mt-1 text-xs" style={{ color: C.slateLight }}>
            {dueInDays !== null && dueInDays >= 0
              ? `Likely due for another ${visitLabel.toLowerCase()} within ${dueInDays} days`
              : `${row.days_since_last_visit} days since last ${visitLabel.toLowerCase()}`}
            {" · "}Lifetime value: {business?.currency} {Number(row.total_spending || 0).toLocaleString()}
          </div>
        </div>
        <Btn
          icon={MessageCircle}
          disabled={!row.phone}
          onClick={() => openWhatsApp(row.phone, generateMessage({
            action: nba.action, customerName: row.name, businessName: business?.name, days: row.days_since_last_visit, language: business?.default_language,
          }))}
        >
          Open WhatsApp
        </Btn>
      </div>
      <div className="mt-3 rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg }}>
        <span className="font-bold" style={{ color: C.navy }}>{nba.action}</span>
        <span style={{ color: C.slate }}> — {nba.reason}</span>
      </div>
    </div>
  );
}

export default function Retention() {
  const { business } = useAuth();
  const { rows, ready } = useCustomerOverview(business?.id);
  const [tab, setTab] = useState("due");
  const visitLabel = business?.visit_label || "Visit";

  const byRiskThenValue = (a, b) =>
    (churnRiskScore(b)?.score || 0) - (churnRiskScore(a)?.score || 0) || Number(b.total_spending || 0) - Number(a.total_spending || 0);
  const due = useMemo(() => rows.filter((r) => r.is_due).sort(byRiskThenValue), [rows]);
  const atRisk = useMemo(() => rows.filter((r) => r.is_at_risk).sort(byRiskThenValue), [rows]);

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>Loading…</div>;

  const active = tab === "due" ? due : atRisk;

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold" style={{ color: C.ink }}>Retention</h1>
      <p className="mt-1 text-sm" style={{ color: C.slateLight }}>Reach customers before they become inactive.</p>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => setTab("due")}
          className="rounded-xl px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: tab === "due" ? C.green : C.white, color: tab === "due" ? C.white : C.navy, border: `1px solid ${C.border}` }}
        >
          Due Soon ({due.length})
        </button>
        <button
          onClick={() => setTab("at_risk")}
          className="rounded-xl px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: tab === "at_risk" ? C.amber : C.white, color: tab === "at_risk" ? C.white : C.navy, border: `1px solid ${C.border}` }}
        >
          At Risk ({atRisk.length})
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {active.length === 0 ? (
          <EmptyState
            title={tab === "due" ? "No one is due soon" : "No at-risk customers"}
            subtitle={tab === "due" ? "Nobody is approaching their expected return date right now." : "No customers show a declining visit pattern right now."}
          />
        ) : (
          active.map((row) => (
            <CustomerRow
              key={row.customer_id}
              row={row}
              visitLabel={visitLabel}
              business={business}
              badge={tab === "at_risk" ? <Pill color={C.amber} bg="#C77D141a">At Risk</Pill> : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
