import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Mail } from "lucide-react";
import { C } from "../components/theme";
import Logo from "../components/Logo";
import LanguageSelector from "../components/LanguageSelector";
import { Btn, LoadingScreen } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useUILanguage } from "../lib/uiPrefs";
import { fetchPublicPlans, fetchSubscriptionSettings, computeAnnualSavings } from "../lib/plans";
import { formatMoney } from "../lib/currencies";

const SELECTED_PLAN_KEY = "smartmanager-loyalty:selected-plan-id";
const SELECTED_BILLING_KEY = "smartmanager-loyalty:selected-billing-interval";

function PlanCard({ plan, billing, onSelect, ctaBusy }) {
  const { t } = useTranslation();
  const isCustom = plan.price_monthly == null;
  const price = billing === "annual" ? plan.price_yearly : plan.price_monthly;
  const savings = !isCustom ? computeAnnualSavings(plan.price_monthly, plan.price_yearly) : null;

  return (
    <div
      className={`relative flex flex-col rounded-2xl bg-white p-6 shadow-sm transition-transform ${plan.is_featured ? "sm:-translate-y-2" : ""}`}
      style={{ border: plan.is_featured ? `2px solid ${C.green}` : `1px solid ${C.border}` }}
    >
      {plan.badge_text && (
        <span
          className="absolute -top-3 start-6 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: C.green, color: C.white }}
        >
          {plan.badge_text}
        </span>
      )}

      <h3 className="text-base font-bold" style={{ color: C.ink }}>{plan.name}</h3>
      {plan.short_description && (
        <p className="mt-1 min-h-[32px] text-xs" style={{ color: C.slateLight }}>{plan.short_description}</p>
      )}

      <div className="mt-4">
        {isCustom ? (
          <div className="text-3xl font-bold" style={{ color: C.ink }}>{t("pricing.custom")}</div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold" style={{ color: C.ink }}>{formatMoney(price, plan.currency)}</span>
              <span className="text-xs font-semibold" style={{ color: C.slateLight }}>
                {billing === "annual" ? t("pricing.perYear") : t("pricing.perMonth")}
              </span>
            </div>
            {billing === "annual" && savings && savings.amount > 0 && (
              <div className="mt-1 text-xs font-semibold" style={{ color: C.green }}>
                {t("pricing.saveAmount", { amount: formatMoney(savings.amount, plan.currency) })} · {t("pricing.monthsFree", { count: Math.round(savings.monthsFree) })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 space-y-1 text-xs" style={{ color: C.slate }}>
        <div>{plan.max_customers ? t("pricing.upToCustomers", { count: plan.max_customers }) : t("pricing.unlimitedCustomers")}</div>
        <div>{plan.location_limit ? t("pricing.upToLocations", { count: plan.location_limit }) : t("pricing.unlimitedLocations")}</div>
      </div>

      <ul className="mt-5 flex-1 space-y-2 text-xs" style={{ color: C.slate }}>
        {(plan.features || []).map((f) => (
          <li key={f.key} className="flex items-start gap-2">
            <Check size={14} className="mt-0.5 shrink-0" color={C.green} />
            <span>{f.display_text || f.name}</span>
          </li>
        ))}
      </ul>

      {isCustom ? (
        <a href="mailto:sales@smartmanager.app?subject=SmartManager%20Loyalty%20Enterprise">
          <Btn variant="secondary" icon={Mail} className="mt-6 w-full justify-center">{t("pricing.contactSales")}</Btn>
        </a>
      ) : (
        <Btn onClick={() => onSelect(plan)} disabled={ctaBusy} className="mt-6 w-full justify-center">
          {t("pricing.startFreeTrial")}
        </Btn>
      )}
    </div>
  );
}

export default function Pricing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, business } = useAuth();
  const { language, setLanguage } = useUILanguage();

  const [plans, setPlans] = useState(null);
  const [settings, setSettings] = useState(null);
  const [billing, setBilling] = useState("monthly");

  useEffect(() => {
    document.title = t("pricing.seoTitle");
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = t("pricing.seoDescription");
  }, [t]);

  useEffect(() => {
    Promise.all([fetchPublicPlans(), fetchSubscriptionSettings()])
      .then(([p, s]) => { setPlans(p); setSettings(s); })
      .catch(() => { setPlans([]); setSettings({ free_trial_enabled: false, free_trial_days: 14 }); });
  }, []);

  function handleSelect(plan) {
    try {
      window.sessionStorage.setItem(SELECTED_PLAN_KEY, plan.id);
      window.sessionStorage.setItem(SELECTED_BILLING_KEY, billing);
    } catch (e) { /* ignore */ }

    if (session && business) {
      // Already running a business: send them to manage their existing
      // subscription instead of silently starting a second one.
      navigate("/settings?tab=billing");
      return;
    }
    navigate(session ? "/" : "/signup");
  }

  if (plans === null) return <LoadingScreen />;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: C.bg }}>
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <Link to="/"><Logo variant="wordmark" /></Link>
        <div className="flex items-center gap-3">
          <LanguageSelector language={language} onChange={setLanguage} />
          {session ? (
            <Link to="/"><Btn variant="secondary">{t("pricing.goToDashboard")}</Btn></Link>
          ) : (
            <>
              <Link to="/login" className="text-sm font-semibold" style={{ color: C.navy }}>{t("auth.login.signIn")}</Link>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-6 sm:px-10">
        <div className="text-center">
          <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.ink }}>{t("pricing.heroTitle")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm" style={{ color: C.slateLight }}>{t("pricing.heroSubtitle")}</p>
          {settings?.free_trial_enabled && (
            <p className="mt-3 text-sm font-semibold" style={{ color: C.green }}>
              {t("pricing.trialBanner", { count: settings.free_trial_days })}
            </p>
          )}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <div className="inline-flex rounded-full p-1" style={{ backgroundColor: C.white, border: `1px solid ${C.border}` }}>
            {["monthly", "annual"].map((b) => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                className="rounded-full px-4 py-1.5 text-xs font-bold transition-colors"
                style={{ backgroundColor: billing === b ? C.green : "transparent", color: billing === b ? C.white : C.slate }}
              >
                {t(`pricing.billing.${b}`)}
              </button>
            ))}
          </div>
          {billing === "annual" && (
            <span className="text-xs font-semibold" style={{ color: C.green }}>{t("pricing.twoMonthsFree")}</span>
          )}
        </div>

        {plans.length === 0 ? (
          <div className="mt-16 rounded-2xl bg-white p-10 text-center shadow-sm" style={{ border: `1px solid ${C.border}` }}>
            <p className="text-sm font-semibold" style={{ color: C.ink }}>{t("pricing.unavailableTitle")}</p>
            <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("pricing.unavailableBody")}</p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} billing={billing} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
