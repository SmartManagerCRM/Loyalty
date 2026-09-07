import React from "react";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Pill } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";

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

  return (
    <div className="p-8 max-w-xl">
      <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold" style={{ color: C.slateLight }}>{t("settings.billing.currentPlan")}</div>
            <div className="mt-1 text-lg font-bold" style={{ color: C.ink }}>{t(`settings.billing.plans.${planKey}`)}</div>
          </div>
          <Pill color={STATUS_COLOR[business?.subscription_status]} bg={`${STATUS_COLOR[business?.subscription_status]}1a`}>
            {business?.subscription_status === "trialing" ? t("settings.billing.trial") : business?.subscription_status}
          </Pill>
        </div>

        {business?.subscription_status === "trialing" && (
          <div className="mt-4 rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg, color: C.slate }}>
            {trialDays > 0 ? t("settings.billing.trialDaysLeft", { count: trialDays }) : t("settings.billing.trialEnded")} {t("settings.billing.noPaymentRequired")}
          </div>
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
    </div>
  );
}
