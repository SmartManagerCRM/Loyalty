import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search, Upload, RotateCcw } from "lucide-react";
import { C } from "../components/theme";
import Logo from "../components/Logo";
import { Btn, TextInput, Select, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { CURRENCIES } from "../lib/currencies";
import { COUNTRIES } from "../lib/countries";
import { parseSpreadsheetFile, rowsToCustomers } from "../lib/csvImport";

const BUSINESS_TYPE_KEYS = ["clinic", "dental", "physiotherapy", "beauty_salon", "spa", "gym", "barber", "car_service", "training_center", "consultant", "other"];

// The business's own word for "visit" (Appointment/Session/…) is stored
// and reused verbatim across the whole app (e.g. "Log {visit_label}") —
// it's business-chosen vocabulary, not app chrome, so it's deliberately
// not translated here, the same way a business's own name isn't.
const VISIT_LABELS = ["Visit", "Appointment", "Session", "Service", "Purchase"];

// Mirrors the defaults create_business() seeds in supabase/schema.sql —
// the Rules step lets someone tweak these before the business exists,
// then Finish upserts whatever's here (unchanged defaults included, since
// upsert is a harmless no-op in that case).
const DEFAULT_RULES = {
  new: { days: 14 },
  active: { days: 30 },
  due: { days_before: 5 },
  inactive: { days: 30 },
  lost: { days: 90 },
  vip: { min_spending: 3000, min_visits: 10 },
  high_value: { min_lifetime_value: 2000 },
  frequent: { min_visits_per_90d: 3 },
  at_risk: { overdue_ratio: 1.3 },
};
const RULE_ORDER = ["new", "active", "due", "inactive", "lost", "vip", "high_value", "frequent", "at_risk"];
const RULE_FIELD_KEYS = {
  new: ["days"], active: ["days"], due: ["days_before"], inactive: ["days"], lost: ["days"],
  vip: ["min_spending", "min_visits"], high_value: ["min_lifetime_value"], frequent: ["min_visits_per_90d"], at_risk: ["overdue_ratio"],
};

const STEP_KEYS = ["businessInfo", "country", "currency", "type", "import", "rules", "finish"];

function cloneDefaultRules() {
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

function StepIndicator({ step }) {
  const { t } = useTranslation();
  const pct = ((step + 1) / STEP_KEYS.length) * 100;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs font-semibold" style={{ color: C.slateLight }}>
        <span>{t("auth.onboarding.stepOf", { current: step + 1, total: STEP_KEYS.length })}</span>
        <span style={{ color: C.green }}>{t(`auth.onboarding.steps.${STEP_KEYS[step]}`)}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: C.bg }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: C.green }} />
      </div>
    </div>
  );
}

function StepBusinessInfo({ form, setForm }) {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.onboarding.businessInfo.title")}</h1>
      <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.onboarding.businessInfo.subtitle")}</p>
      <div className="mt-5">
        <Field label={t("auth.onboarding.businessNameLabel")}>
          <TextInput autoFocus required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("auth.onboarding.businessNamePlaceholder")} />
        </Field>
      </div>
    </div>
  );
}

function StepCountry({ form, setForm }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => t(`countries.${c.code}`).toLowerCase().includes(q));
  }, [search, t]);

  function choose(country) {
    setForm((f) => ({ ...f, country: country?.code || "other", currency: country?.currency || f.currency, language: country?.language || f.language }));
  }

  return (
    <div>
      <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.onboarding.country.title")}</h1>
      <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.onboarding.country.subtitle")}</p>
      <div className="relative mt-4">
        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: C.slateLight }} />
        <TextInput className="ps-9" placeholder={t("auth.onboarding.country.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pe-1 sm:grid-cols-3">
        {filtered.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => choose(c)}
            className="flex items-center justify-between rounded-xl px-3 py-2 text-start text-sm font-semibold hover:bg-black/5"
            style={{ border: `1px solid ${form.country === c.code ? C.green : C.border}`, color: C.ink, backgroundColor: form.country === c.code ? C.greenTint : C.white }}
          >
            {t(`countries.${c.code}`)}
            {form.country === c.code && <Check size={14} color={C.green} />}
          </button>
        ))}
        <button
          type="button"
          onClick={() => choose(null)}
          className="flex items-center justify-between rounded-xl px-3 py-2 text-start text-sm font-semibold hover:bg-black/5"
          style={{ border: `1px solid ${form.country === "other" ? C.green : C.border}`, color: C.ink, backgroundColor: form.country === "other" ? C.greenTint : C.white }}
        >
          {t("auth.onboarding.country.other")}
          {form.country === "other" && <Check size={14} color={C.green} />}
        </button>
      </div>
    </div>
  );
}

function StepCurrency({ form, setForm }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [search]);

  return (
    <div>
      <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.onboarding.currency.title")}</h1>
      <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.onboarding.currency.subtitle")}</p>
      <div className="relative mt-4">
        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: C.slateLight }} />
        <TextInput className="ps-9" placeholder={t("auth.onboarding.currency.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pe-1">
        {filtered.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setForm((f) => ({ ...f, currency: c.code }))}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-start text-sm hover:bg-black/5"
            style={{ border: `1px solid ${form.currency === c.code ? C.green : C.border}`, color: C.ink, backgroundColor: form.currency === c.code ? C.greenTint : C.white }}
          >
            <span>{c.code} — {c.name}</span>
            {form.currency === c.code && <Check size={14} color={C.green} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepType({ form, setForm }) {
  const { t } = useTranslation();
  const BUSINESS_TYPES = BUSINESS_TYPE_KEYS.map((value) => ({ value, label: t(`businessTypes.${value}`) }));
  return (
    <div>
      <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.onboarding.type.title")}</h1>
      <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.onboarding.type.subtitle")}</p>
      <div className="mt-5 flex flex-col gap-3">
        <Field label={t("auth.onboarding.businessTypeLabel")}>
          <Select options={BUSINESS_TYPES} value={form.businessType} onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))} />
        </Field>
        <Field label={t("auth.onboarding.visitLabelLabel")}>
          <Select options={VISIT_LABELS} value={form.visitLabel} onChange={(e) => setForm((f) => ({ ...f, visitLabel: e.target.value }))} />
        </Field>
      </div>
    </div>
  );
}

function StepImport({ form, setForm }) {
  const { t } = useTranslation();
  const [reading, setReading] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReading(true);
    setLocalError(null);
    try {
      const rawRows = await parseSpreadsheetFile(file);
      const { customers, skipped } = rowsToCustomers(rawRows);
      setForm((f) => ({ ...f, importFileName: file.name, importCustomers: customers, importSkipped: skipped }));
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setReading(false);
    }
  }

  function clearFile() {
    setForm((f) => ({ ...f, importFileName: "", importCustomers: [], importSkipped: 0 }));
  }

  return (
    <div>
      <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.onboarding.import.title")}</h1>
      <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.onboarding.import.subtitle")}</p>

      {form.importFileName ? (
        <div className="mt-4 rounded-2xl p-4 text-sm" style={{ backgroundColor: C.greenTint }}>
          <p className="font-semibold" style={{ color: C.greenDeep }}>
            {t("auth.onboarding.import.previewSummary", { count: form.importCustomers.length })}
          </p>
          {form.importSkipped > 0 && <p className="mt-1 text-xs" style={{ color: C.slate }}>{t("auth.onboarding.import.previewSkipped", { count: form.importSkipped })}</p>}
          <Btn variant="secondary" className="mt-3" onClick={clearFile}>{t("auth.onboarding.import.clear")}</Btn>
        </div>
      ) : (
        <label
          className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center hover:bg-black/[0.02]"
          style={{ borderColor: C.border }}
        >
          <Upload size={22} color={C.slateLight} />
          <span className="text-sm font-semibold" style={{ color: C.ink }}>
            {reading ? t("auth.onboarding.import.reading") : t("auth.onboarding.import.chooseFile")}
          </span>
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} disabled={reading} />
        </label>
      )}
      {localError && <p className="mt-2 text-xs" style={{ color: C.red }}>{localError}</p>}
    </div>
  );
}

function StepRules({ form, setForm }) {
  const { t } = useTranslation();
  function setField(segmentKey, field, value) {
    setForm((f) => ({
      ...f,
      rules: { ...f.rules, [segmentKey]: { ...f.rules[segmentKey], [field]: value === "" ? "" : Number(value) } },
    }));
  }
  function reset() {
    setForm((f) => ({ ...f, rules: cloneDefaultRules() }));
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.onboarding.rules.title")}</h1>
          <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.onboarding.rules.subtitle")}</p>
        </div>
        <Btn variant="secondary" icon={RotateCcw} onClick={reset} className="shrink-0">{t("auth.onboarding.rules.resetDefaults")}</Btn>
      </div>

      <div className="mt-4 grid max-h-72 grid-cols-1 gap-3 overflow-y-auto pe-1 sm:grid-cols-2">
        {RULE_ORDER.map((key) => (
          <div key={key} className="rounded-2xl p-3" style={{ border: `1px solid ${C.border}` }}>
            <div className="text-xs font-bold" style={{ color: C.ink }}>{t(`settings.segmentation.fields.${key}.title`)}</div>
            <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: RULE_FIELD_KEYS[key].length > 1 ? "1fr 1fr" : "1fr" }}>
              {RULE_FIELD_KEYS[key].map((field) => (
                <Field key={field} label={t(`settings.segmentation.fields.${key}.${field}`)}>
                  <TextInput type="number" step="any" value={form.rules[key]?.[field] ?? ""} onChange={(e) => setField(key, field, e.target.value)} />
                </Field>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepFinish({ form, busy, error, onCreate }) {
  const { t } = useTranslation();
  const country = form.country !== "other" ? t(`countries.${form.country}`) : t("auth.onboarding.country.other");
  return (
    <div>
      <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.onboarding.finish.title")}</h1>
      <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.onboarding.finish.subtitle")}</p>

      <dl className="mt-5 space-y-2 rounded-2xl p-4 text-sm" style={{ backgroundColor: C.bg }}>
        {[
          [t("auth.onboarding.finish.summaryBusiness"), form.name],
          [t("auth.onboarding.finish.summaryType"), t(`businessTypes.${form.businessType}`)],
          [t("auth.onboarding.finish.summaryVisitLabel"), form.visitLabel],
          [t("auth.onboarding.finish.summaryCountry"), country],
          [t("auth.onboarding.finish.summaryCurrency"), form.currency],
          [t("auth.onboarding.finish.summaryCustomers"), form.importCustomers.length > 0 ? form.importCustomers.length : t("auth.onboarding.finish.summaryCustomersNone")],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <dt style={{ color: C.slateLight }}>{label}</dt>
            <dd className="font-semibold" style={{ color: C.ink }}>{value}</dd>
          </div>
        ))}
      </dl>

      {error && <p className="mt-3 text-xs" style={{ color: C.red }}>{error}</p>}

      <Btn onClick={onCreate} disabled={busy} className="mt-5 w-full justify-center">
        {busy ? t("auth.onboarding.finish.creating") : t("auth.onboarding.finish.createMyBusiness")}
      </Btn>
    </div>
  );
}

export default function Onboarding() {
  const { t } = useTranslation();
  const { createBusiness } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "", country: "SA", currency: "SAR", language: "ar",
    businessType: "clinic", visitLabel: "Visit",
    importFileName: "", importCustomers: [], importSkipped: 0,
    rules: cloneDefaultRules(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canAdvance = step !== 0 || form.name.trim().length > 0;

  function next() { setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  async function handleFinish() {
    setBusy(true);
    setError(null);
    try {
      const businessId = await createBusiness({
        name: form.name.trim(), businessType: form.businessType, visitLabel: form.visitLabel,
        language: form.language, currency: form.currency,
      });

      if (form.importCustomers.length > 0) {
        const { error: insertError } = await supabase
          .from("customers")
          .insert(form.importCustomers.map((c) => ({ ...c, business_id: businessId })));
        if (insertError) throw insertError;
      }

      const ruleRows = RULE_ORDER.map((key) => ({ business_id: businessId, segment_key: key, rule_config: form.rules[key] }));
      const { error: rulesError } = await supabase.from("segmentation_rules").upsert(ruleRows, { onConflict: "business_id,segment_key" });
      if (rulesError) throw rulesError;
      // No navigation needed: createBusiness() already switched the active
      // business, so Gate() in App.jsx re-renders straight into the app.
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 py-10" style={{ backgroundColor: C.bg }}>
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="mb-6 flex flex-col items-center">
          <Logo size={44} className="mb-4" />
          <StepIndicator step={step} />
        </div>

        {step === 0 && <StepBusinessInfo form={form} setForm={setForm} />}
        {step === 1 && <StepCountry form={form} setForm={setForm} />}
        {step === 2 && <StepCurrency form={form} setForm={setForm} />}
        {step === 3 && <StepType form={form} setForm={setForm} />}
        {step === 4 && <StepImport form={form} setForm={setForm} />}
        {step === 5 && <StepRules form={form} setForm={setForm} />}
        {step === 6 && <StepFinish form={form} busy={busy} error={error} onCreate={handleFinish} />}

        {step < 6 && (
          <div className="mt-6 flex items-center justify-between">
            {step > 0 ? <Btn variant="secondary" onClick={back}>{t("auth.onboarding.back")}</Btn> : <span />}
            <div className="flex items-center gap-2">
              {step === 4 && <Btn variant="ghost" onClick={next}>{t("auth.onboarding.skipForNow")}</Btn>}
              <Btn onClick={next} disabled={!canAdvance}>{t("auth.onboarding.next")}</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
