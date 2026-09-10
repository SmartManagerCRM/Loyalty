import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, MessageCircle } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Pill, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useBusinessTable } from "../../lib/useBusinessTable";
import { useMembershipsOverview } from "../../lib/useMembershipsOverview";
import { generateMembershipMessage } from "../../lib/messageTemplates";
import { openWhatsApp } from "../../lib/whatsapp";
import { formatMoney } from "../../lib/currencies";
import { supabase } from "../../lib/supabaseClient";
import { usePlanFeatures } from "../../lib/plans";
import UpgradePrompt from "../../components/UpgradePrompt";
import AssignMembershipModal from "./AssignMembershipModal";

const TABS = ["active", "expiringSoon", "unused", "expiredCompleted", "cancelled"];

function categorize(m) {
  if (m.status === "cancelled") return "cancelled";
  if (m.is_expired || m.is_completed) return "expiredCompleted";
  if (m.is_expiring_soon) return "expiringSoon";
  if (m.is_unused) return "unused";
  return "active";
}

function statusPill(m, t) {
  if (m.status === "cancelled") return <Pill color={C.slateLight} bg={C.bg}>{t("memberships.status.cancelled")}</Pill>;
  if (m.is_expired) return <Pill color={C.red} bg="#C63B3B1a">{t("memberships.status.expired")}</Pill>;
  if (m.is_completed) return <Pill color={C.slate} bg={C.bg}>{t("memberships.status.completed")}</Pill>;
  if (m.is_expiring_soon) return <Pill color={C.amber} bg="#C77D141a">{t("memberships.status.expiringSoon")}</Pill>;
  return <Pill color={C.green} bg={C.greenTint}>{t("memberships.status.active")}</Pill>;
}

function MembershipRow({ m, business, onCancel, onRenew }) {
  const { t } = useTranslation();
  const showRenew = m.status === "cancelled" || m.is_expired || m.is_completed;
  const showCancel = !showRenew;
  const messageAction = m.is_expiring_soon ? "EXPIRING_SOON" : "UNUSED_SESSIONS";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: C.ink }}><bdi>{m.customer_name}</bdi></span>
            {statusPill(m, t)}
          </div>
          <div className="mt-1 text-xs" style={{ color: C.slateLight }}>
            <bdi>{m.plan_name}</bdi>
            {" · "}
            {m.total_sessions != null ? t("memberships.sessionsLeft", { used: m.sessions_used, total: m.total_sessions }) : t("memberships.unlimitedSessions")}
            {" · "}
            {formatMoney(m.price_paid, business?.currency)}
            {m.expires_at && <> {" · "}{t("memberships.expiresOn", { date: m.expires_at })}</>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(m.is_expiring_soon || m.is_unused) && (
            <Btn
              icon={MessageCircle}
              disabled={!m.customer_phone}
              onClick={() => openWhatsApp(m.customer_phone, generateMembershipMessage({
                action: messageAction, customerName: m.customer_name, businessName: business?.name,
                planName: m.plan_name, sessionsRemaining: m.sessions_remaining, language: business?.default_language,
              }))}
            >
              {t("common.openWhatsApp")}
            </Btn>
          )}
          {showCancel && <Btn variant="danger" onClick={() => onCancel(m)}>{t("memberships.cancelMembership")}</Btn>}
          {showRenew && <Btn variant="secondary" onClick={() => onRenew(m)}>{t("memberships.renewMembership")}</Btn>}
        </div>
      </div>
    </div>
  );
}

export default function Memberships() {
  const { t } = useTranslation();
  const { business } = useAuth();
  const { rows, ready, refetch } = useMembershipsOverview(business?.id);
  const { rows: customers, ready: customersReady } = useBusinessTable("customers", business?.id, { orderBy: "name", ascending: true });
  const { rows: plans, ready: plansReady } = useBusinessTable("membership_plans", business?.id, { orderBy: "name", ascending: true });
  const { ready: featuresReady, hasFeature } = usePlanFeatures();

  const [tab, setTab] = useState("active");
  const [showAssign, setShowAssign] = useState(false);

  const ready2 = ready && customersReady && plansReady;
  const activePlans = useMemo(() => plans.filter((p) => p.active), [plans]);

  const grouped = useMemo(() => {
    const g = { active: [], expiringSoon: [], unused: [], expiredCompleted: [], cancelled: [] };
    for (const m of rows) g[categorize(m)].push(m);
    return g;
  }, [rows]);

  async function cancelMembership(m) {
    await supabase.from("customer_memberships").update({ status: "cancelled" }).eq("id", m.id).eq("business_id", business.id);
    refetch();
  }

  async function renewMembership(m) {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const startsAt = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    let expiresAt = null;
    const sourcePlan = plans.find((p) => p.id === m.plan_id);
    if (sourcePlan?.validity_days) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + sourcePlan.validity_days);
      expiresAt = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    }
    await supabase.from("customer_memberships").insert({
      business_id: business.id,
      customer_id: m.customer_id,
      plan_id: m.plan_id,
      plan_name: m.plan_name,
      total_sessions: sourcePlan ? sourcePlan.total_sessions : m.total_sessions,
      sessions_used: 0,
      price_paid: sourcePlan ? sourcePlan.price : m.price_paid,
      starts_at: startsAt,
      expires_at: expiresAt,
    });
    refetch();
  }

  if (!ready2) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("common.loading")}</div>;
  if (featuresReady && !hasFeature("memberships")) return <UpgradePrompt featureName={t("planFeatures.memberships")} />;

  const active = grouped[tab];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-xl text-sm" style={{ color: C.slateLight }}>{t("memberships.intro")}</p>
        <Btn
          icon={Plus}
          disabled={activePlans.length === 0}
          onClick={() => setShowAssign(true)}
          className="shrink-0"
        >
          {t("memberships.addMembership")}
        </Btn>
      </div>
      {activePlans.length === 0 && (
        <p className="mt-2 text-xs" style={{ color: C.amber }}>{t("memberships.noPlansHint")}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: tab === tb ? C.green : C.white, color: tab === tb ? C.white : C.navy, border: `1px solid ${C.border}` }}
          >
            {t(`memberships.tabs.${tb}`, { count: grouped[tb].length })}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {active.length === 0 ? (
          <EmptyState title={t(`memberships.empty.${tab}Title`)} subtitle={t(`memberships.empty.${tab}Subtitle`)} />
        ) : (
          active.map((m) => (
            <MembershipRow key={m.id} m={m} business={business} onCancel={cancelMembership} onRenew={renewMembership} />
          ))
        )}
      </div>

      {showAssign && (
        <AssignMembershipModal
          business={business}
          customers={customers}
          plans={activePlans}
          onClose={() => setShowAssign(false)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
