import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Check } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Pill } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { formatMoney } from "../../lib/currencies";

const STATUS_COLOR = { trialing: C.amber, active: C.green, past_due: C.red, canceled: C.slateLight, expired: C.slateLight, suspended: C.red };

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.max(0, Math.ceil((new Date(dateStr) - Date.now()) / 86400000));
}

function contactLink(subject, plan) {
  const s = encodeURIComponent(`${subject}${plan ? ` — ${plan}` : ""} (SmartManager Loyalty)`);
  return `mailto:sales@smartmanager.app?subject=${s}`;
}

export default function Billing() {
  const { t } = useTranslation();
  const { business, role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const trialDays = daysLeft(business?.trial_ends_at);

  const [plans, setPlans] = useState([]);
  const [latestSubscription, setLatestSubscription] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    Promise.all([
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("subscriptions").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(1),
    ]).then(([plansRes, subRes]) => {
      setPlans(plansRes.data || []);
      setLatestSubscription(subRes.data?.[0] || null);
      setReady(true);
    });
  }, [business?.id]);

  const currentPlan = plans.find((p) => p.key === business?.subscription_plan);
  const billingInterval = business?.billing_interval || "monthly";
  const price = business?.subscription_price ?? (billingInterval === "annual" ? currentPlan?.price_yearly : currentPlan?.price_monthly);
  const currency = business?.subscription_currency || currentPlan?.currency || "USD";

  return (
    <div className="p-8 max-w-3xl">
      <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold" style={{ color: C.slateLight }}>{t("settings.billing.currentPlan")}</div>
            <div className="mt-1 text-lg font-bold" style={{ color: C.ink }}>
              {currentPlan?.name || business?.subscription_plan}
              {price != null && (
                <span className="ms-2 text-sm font-normal" style={{ color: C.slateLight }}>
                  {formatMoney(price, currency)}{billingInterval === "annual" ? t("pricing.perYear") : t("pricing.perMonth")}
                </span>
              )}
            </div>
          </div>
          <Pill color={STATUS_COLOR[business?.subscription_status]} bg={`${STATUS_COLOR[business?.subscription_status]}1a`}>
            {t(`admin.common.statuses.${business?.subscription_status}`)}
          </Pill>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt style={{ color: C.slateLight }}>{t("settings.billing.billingInterval")}</dt>
            <dd className="mt-0.5 font-semibold" style={{ color: C.ink }}>{t(`pricing.billing.${billingInterval}`)}</dd>
          </div>
          {business?.subscription_status === "trialing" ? (
            <div>
              <dt style={{ color: C.slateLight }}>{t("settings.billing.trialDaysRemaining")}</dt>
              <dd className="mt-0.5 font-semibold" style={{ color: C.ink }}>{trialDays}</dd>
            </div>
          ) : latestSubscription?.subscription_start ? (
            <div>
              <dt style={{ color: C.slateLight }}>{t("settings.billing.activeSince")}</dt>
              <dd className="mt-0.5 font-semibold" style={{ color: C.ink }}>{new Date(latestSubscription.subscription_start).toLocaleDateString()}</dd>
            </div>
          ) : null}
        </dl>

        {business?.subscription_status === "trialing" && (
          <div className="mt-4 rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg, color: C.slate }}>
            {trialDays > 0 ? t("settings.billing.trialDaysLeft", { count: trialDays }) : t("settings.billing.trialEnded")} {t("settings.billing.noPaymentRequired")}
          </div>
        )}

        {currentPlan?.short_description && (
          <p className="mt-4 text-xs" style={{ color: C.slateLight }}>{currentPlan.short_description}</p>
        )}

        <div className="mt-5 border-t pt-4 text-xs" style={{ borderColor: C.border, color: C.slateLight }}>
          {t("settings.billing.notConnected")}{" "}
          {canManage ? t("settings.billing.readyToGoLive") : t("settings.billing.askOwnerAdmin")}
        </div>

        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={contactLink(t("settings.billing.upgradeSubject"), currentPlan?.name)}>
              <Btn variant="secondary" icon={Mail}>{t("settings.billing.contactUpgrade")}</Btn>
            </a>
            <a href={contactLink(t("settings.billing.changeBillingSubject"), currentPlan?.name)}>
              <Btn variant="secondary" icon={Mail}>{t("settings.billing.changeBillingInterval")}</Btn>
            </a>
            <a href={contactLink(t("settings.billing.cancelSubject"), currentPlan?.name)}>
              <Btn variant="ghost" icon={Mail}>{t("settings.billing.cancelSubscription")}</Btn>
            </a>
          </div>
        )}
      </div>

      {ready && plans.filter((p) => p.key !== business?.subscription_plan).length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.filter((p) => p.key !== business?.subscription_plan).map((p) => (
            <div key={p.id} className="flex flex-col rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
              <div className="text-sm font-bold" style={{ color: C.ink }}>{p.name}</div>
              <div className="mt-1 text-lg font-bold" style={{ color: C.ink }}>
                {p.price_monthly != null ? (
                  <>
                    {formatMoney(p.price_monthly, p.currency)}
                    <span className="text-xs font-normal" style={{ color: C.slateLight }}>{t("pricing.perMonth")}</span>
                  </>
                ) : t("admin.plans.custom")}
              </div>
              {(p.features || []).length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px]" style={{ color: C.slate }}>
                  {(p.features || []).slice(0, 4).map((f, i) => <li key={i} className="flex items-center gap-1"><Check size={11} color={C.green} />{f}</li>)}
                </ul>
              )}
              {canManage && (
                <a href={contactLink(t("settings.billing.upgradeSubject"), p.name)} className="mt-3">
                  <Btn variant="secondary" className="w-full justify-center">{t("settings.billing.switchTo", { plan: p.name })}</Btn>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
