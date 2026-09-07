import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { C } from "../components/theme";
import Logo from "../components/Logo";
import { Btn, TextInput, Select, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { CURRENCIES } from "../lib/currencies";

const BUSINESS_TYPE_KEYS = ["clinic", "dental", "physiotherapy", "beauty_salon", "spa", "gym", "barber", "car_service", "training_center", "consultant", "other"];

// The business's own word for "visit" (Appointment/Session/…) is stored
// and reused verbatim across the whole app (e.g. "Log {visit_label}") —
// it's business-chosen vocabulary, not app chrome, so it's deliberately
// not translated here, the same way a business's own name isn't.
const VISIT_LABELS = ["Visit", "Appointment", "Session", "Service", "Purchase"];

export default function Onboarding() {
  const { t } = useTranslation();
  const BUSINESS_TYPES = BUSINESS_TYPE_KEYS.map((value) => ({ value, label: t(`businessTypes.${value}`) }));
  const LANGUAGES = [{ value: "en", label: t("languages.en") }, { value: "ar", label: t("languages.ar") }];
  const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
  const { createBusiness } = useAuth();
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("clinic");
  const [visitLabel, setVisitLabel] = useState("Visit");
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("SAR");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createBusiness({ name: name.trim(), businessType, visitLabel, language, currency });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center px-4" style={{ backgroundColor: C.bg }}>
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} className="mb-3" />
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.onboarding.title")}</h1>
          <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.onboarding.subtitle")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("auth.onboarding.businessNameLabel")} span>
            <TextInput required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auth.onboarding.businessNamePlaceholder")} />
          </Field>
          <Field label={t("auth.onboarding.businessTypeLabel")}>
            <Select options={BUSINESS_TYPES} value={businessType} onChange={(e) => setBusinessType(e.target.value)} />
          </Field>
          <Field label={t("auth.onboarding.visitLabelLabel")}>
            <Select options={VISIT_LABELS} value={visitLabel} onChange={(e) => setVisitLabel(e.target.value)} />
          </Field>
          <Field label={t("auth.onboarding.defaultLanguageLabel")}>
            <Select options={LANGUAGES} value={language} onChange={(e) => setLanguage(e.target.value)} />
          </Field>
          <Field label={t("auth.onboarding.currencyLabel")}>
            <Select options={CURRENCY_OPTIONS} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </Field>
        </div>

        {error && <p className="mt-3 text-xs" style={{ color: C.red }}>{error}</p>}

        <Btn type="submit" disabled={busy} className="mt-6 w-full justify-center">
          {busy ? t("auth.onboarding.settingUp") : t("auth.onboarding.createBusiness")}
        </Btn>
      </form>
    </div>
  );
}
