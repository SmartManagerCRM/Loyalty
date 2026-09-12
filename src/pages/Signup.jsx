import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { C } from "../components/theme";
import Logo from "../components/Logo";
import { Btn, TextInput, Field, LoadingScreen } from "../components/ui";
import { supabase } from "../lib/supabaseClient";
import { fetchPublicPlans, fetchSubscriptionSettings } from "../lib/plans";
import { formatMoney } from "../lib/currencies";

const SELECTED_PLAN_KEY = "smartmanager-loyalty:selected-plan-id";
const SELECTED_BILLING_KEY = "smartmanager-loyalty:selected-billing-interval";

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(undefined); // undefined = loading, null = none found
  const [trialDays, setTrialDays] = useState(14);
  const billingInterval = (() => { try { return window.sessionStorage.getItem(SELECTED_BILLING_KEY) || "monthly"; } catch (e) { return "monthly"; } })();

  // Plan selection is mandatory before an account can be created — the
  // only way here is through /pricing, which stamps sessionStorage.
  useEffect(() => {
    let planId = null;
    try { planId = window.sessionStorage.getItem(SELECTED_PLAN_KEY); } catch (e) { /* ignore */ }
    if (!planId) { setSelectedPlan(null); return; }
    Promise.all([fetchPublicPlans(), fetchSubscriptionSettings()]).then(([plans, settings]) => {
      const plan = plans.find((p) => p.id === planId) || null;
      setSelectedPlan(plan);
      if (plan) setTrialDays(plan.trial_days ?? settings.free_trial_days ?? 14);
    }).catch(() => setSelectedPlan(null));
  }, []);

  if (selectedPlan === undefined) return <LoadingScreen />;
  if (selectedPlan === null) return <Navigate to="/pricing" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    if (data.session) navigate("/");
    else setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <div className="flex h-screen w-full items-center justify-center px-4" style={{ backgroundColor: C.bg }}>
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.signup.checkEmailTitle")}</h1>
          <p className="mt-2 text-sm" style={{ color: C.slate }}>
            {t("auth.signup.checkEmailPrefix")} <strong>{email}</strong>{t("auth.signup.checkEmailMiddle")}{" "}
            <Link to="/login" className="font-semibold" style={{ color: C.green }}>{t("auth.signup.checkEmailLink")}</Link> {t("auth.signup.checkEmailSuffix")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center px-4" style={{ backgroundColor: C.bg }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} className="mb-3" />
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.signup.title")}</h1>
          <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.signup.subtitle")}</p>
        </div>

        <div className="mb-5 rounded-xl p-3 text-xs" style={{ backgroundColor: C.greenTint }}>
          <div className="flex items-center justify-between">
            <span style={{ color: C.slate }}>{t("auth.signup.selectedPlan")}</span>
            <span className="font-bold" style={{ color: C.greenDeep }}>{selectedPlan.name}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span style={{ color: C.slate }}>{t("auth.signup.billing")}</span>
            <span className="font-semibold" style={{ color: C.ink }}>{t(`pricing.billing.${billingInterval}`)}</span>
          </div>
          {selectedPlan.price_monthly != null && (
            <div className="mt-1 flex items-center justify-between">
              <span style={{ color: C.slate }}>{t("auth.signup.price")}</span>
              <span className="font-semibold" style={{ color: C.ink }}>
                {formatMoney(billingInterval === "annual" ? selectedPlan.price_yearly : selectedPlan.price_monthly, selectedPlan.currency)}
                {billingInterval === "annual" ? t("pricing.perYear") : t("pricing.perMonth")}
              </span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between">
            <span style={{ color: C.slate }}>{t("auth.signup.freeTrial")}</span>
            <span className="font-semibold" style={{ color: C.ink }}>{t("pricing.trialDays", { count: trialDays })}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Field label={t("auth.login.emailLabel")}>
            <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
          </Field>
          <Field label={t("auth.login.passwordLabel")}>
            <TextInput type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.passwordMinLength")} />
          </Field>

          {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}

          <Btn type="submit" disabled={busy} className="w-full justify-center">
            {busy ? t("auth.signup.creatingAccount") : t("auth.signup.createAccount")}
          </Btn>
        </div>

        <p className="mt-5 text-center text-xs" style={{ color: C.slateLight }}>
          {t("auth.signup.alreadyHaveAccount")} <Link to="/login" className="font-semibold" style={{ color: C.green }}>{t("auth.signup.signIn")}</Link>
        </p>
      </form>
    </div>
  );
}
