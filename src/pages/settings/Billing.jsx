import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Check } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Pill } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { formatMoney } from "../../lib/currencies";

const STATUS_COLOR = { trialing: C.amber, active: C.green, past_due: C.red, canceled: C.slateLight };
const PLAN_KEYS = new Set(["trial", "starter", "growth", "professional", "enterprise"]);

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.max(0, Math.ceil((new Date(dateStr) - Date.now()) / 86400000));
}

export default function Billing() {
  const { t } = useTranslation();
  const { business, role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const trialDays = daysLeft(business?.trial_ends_at);
  const planKey = PLAN_KEYS.has(business?.subscription_plan) ? business.subscription_plan : "trial";

  const [plans, setPlans] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.from("plans").select("*").eq("is_active", true).order("sort_order", { ascending: true }).then(({ data }) => {
      setPlans(data || []);
      setReady(true);
    });
  }, []);

  const currentPlan = plans.find((p) => p.key === planKey);

  return (
    <div className="p-8 max-w-3xl">
      <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold" style={{ color: C.slateLight }}>{t("settings.billing.currentPlan")}</div>
            <div className="mt-1 text-lg font-bold" style={{ color: C.ink }}>
              {currentPlan?.name || t(`settings.billing.plans.${planKey}`)}
              {ready && currentPlan?.price_monthly != null && (
                <span className="ms-2 text-sm font-normal" style={{ color: C.slateLight }}>
                  {formatMoney(currentPlan.price_monthly, currentPlan.currency)}{t("admin.plans.perMonth")}
                </span>
              )}
            </div>
          </div>
          <Pill color={STATUS_COLOR[business?.subscription_status]} bg={`${STATUS_COLOR[business?.subscription_status]}1a`}>
            {t(`admin.common.statuses.${business?.subscription_status}`)}
          </Pill>
        </div>

        {business?.subscription_status === "trialing" && (
          <div className="mt-4 rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg, color: C.slate }}>
            {trialDays > 0 ? t("settings.billing.trialDaysLeft", { count: trialDays }) : t("settings.billing.trialEnded")} {t("settings.billing.noPaymentRequired")}
          </div>
        )}

        {currentPlan?.features?.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-xs" style={{ color: C.slate }}>
            {currentPlan.features.map((f, i) => (
              <li key={i} className="flex items-center gap-1.5"><Check size={13} color={C.green} />{f}</li>
            ))}
          </ul>
        )}

        <div className="mt-5 border-t pt-4 text-xs" style={{ borderColor: C.border, color: C.slateLight }}>
          {t("settings.billing.notConnected")}{" "}
          {canManage ? t("settings.billing.readyToGoLive") : t("settings.billing.askOwnerAdmin")}
        </div>

        {canManage && (
          <a href="mailto:sales@smartmanager.app?subject=Upgrade%20my%20SmartManager%20Loyalty%20plan">
            <Btn variant="secondary" icon={Mail} className="mt-4 w-full justify-center">{t("settings.billing.contactUpgrade")}</Btn>
          </a>
        )}
      </div>

      {ready && plans.length > 1 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.filter((p) => p.key !== planKey).map((p) => (
            <div key={p.id} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
              <div className="text-sm font-bold" style={{ color: C.ink }}>{p.name}</div>
              <div className="mt-1 text-lg font-bold" style={{ color: C.ink }}>
                {p.price_monthly != null ? (
                  <>
                    {formatMoney(p.price_monthly, p.currency)}
                    <span className="text-xs font-normal" style={{ color: C.slateLight }}>{t("admin.plans.perMonth")}</span>
                  </>
                ) : t("admin.plans.custom")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
