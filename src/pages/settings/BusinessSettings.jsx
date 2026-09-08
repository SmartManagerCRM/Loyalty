import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, Plus } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Select, Field, Modal } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { CURRENCIES } from "../../lib/currencies";

const BUSINESS_TYPE_KEYS = [
  "clinic", "dental", "physiotherapy", "dermatology", "aesthetic_clinic", "laser_clinic",
  "beauty_salon", "spa", "gym", "barber", "car_service", "training_center", "consultant", "other",
];
// Business-chosen vocabulary, deliberately not translated — see the same
// note in Onboarding.jsx.
const VISIT_LABELS = ["Visit", "Appointment", "Session", "Service", "Purchase"];

function NewBusinessModal({ onClose }) {
  const { t } = useTranslation();
  const BUSINESS_TYPES = BUSINESS_TYPE_KEYS.map((value) => ({ value, label: t(`businessTypes.${value}`) }));
  const LANGUAGES = [{ value: "en", label: t("languages.en") }, { value: "ar", label: t("languages.ar") }];
  const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
  const { createBusiness } = useAuth();
  const [form, setForm] = useState({ name: "", businessType: "clinic", visitLabel: "Visit", language: "en", currency: "SAR" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createBusiness(form);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("settings.business.newBusinessModal.title")} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <Field label={t("settings.business.nameLabel")} span><TextInput required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label={t("settings.business.typeLabel")}><Select options={BUSINESS_TYPES} value={form.businessType} onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))} /></Field>
        <Field label={t("settings.business.visitLabelLabel")}><Select options={VISIT_LABELS} value={form.visitLabel} onChange={(e) => setForm((f) => ({ ...f, visitLabel: e.target.value }))} /></Field>
        <Field label={t("settings.business.defaultLanguageLabel")}><Select options={LANGUAGES} value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} /></Field>
        <Field label={t("settings.business.currencyLabel")}><Select options={CURRENCY_OPTIONS} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></Field>
        {error && <p className="col-span-2 text-xs" style={{ color: C.red }}>{error}</p>}
        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Btn variant="secondary" type="button" onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn type="submit" disabled={busy}>{busy ? t("settings.business.newBusinessModal.creating") : t("settings.business.newBusinessModal.createBusiness")}</Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function BusinessSettings() {
  const { t } = useTranslation();
  const BUSINESS_TYPES = BUSINESS_TYPE_KEYS.map((value) => ({ value, label: t(`businessTypes.${value}`) }));
  const LANGUAGES = [{ value: "en", label: t("languages.en") }, { value: "ar", label: t("languages.ar") }];
  const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
  const { business, role, refreshBusiness } = useAuth();
  const [form, setForm] = useState({
    name: business?.name || "", business_type: business?.business_type || "other", visit_label: business?.visit_label || "Visit",
    default_language: business?.default_language || "en", currency: business?.currency || "SAR",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [showNewBusiness, setShowNewBusiness] = useState(false);
  const canEdit = role === "owner" || role === "admin";

  function set(k) { return (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false); }; }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("businesses").update(form).eq("id", business.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    setSaved(true);
    refreshBusiness();
  }

  return (
    <div className="p-8 max-w-xl">
      <div className="flex justify-end">
        <Btn variant="secondary" icon={Plus} onClick={() => setShowNewBusiness(true)}>{t("settings.business.newBusiness")}</Btn>
      </div>

      <form onSubmit={handleSave} className="mt-6 flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <Field label={t("settings.business.nameLabel")}><TextInput required disabled={!canEdit} value={form.name} onChange={set("name")} /></Field>
        <Field label={t("settings.business.typeLabel")}><Select options={BUSINESS_TYPES} disabled={!canEdit} value={form.business_type} onChange={set("business_type")} /></Field>
        <Field label={t("settings.business.visitLabelLabel")}><Select options={VISIT_LABELS} disabled={!canEdit} value={form.visit_label} onChange={set("visit_label")} /></Field>
        <Field label={t("settings.business.defaultLanguageLabel")}><Select options={LANGUAGES} disabled={!canEdit} value={form.default_language} onChange={set("default_language")} /></Field>
        <Field label={t("settings.business.currencyLabel")}><Select options={CURRENCY_OPTIONS} disabled={!canEdit} value={form.currency} onChange={set("currency")} /></Field>

        {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}
        {!canEdit && <p className="text-xs" style={{ color: C.slateLight }}>{t("settings.business.readOnlyHint")}</p>}

        {canEdit && (
          <Btn type="submit" icon={Save} disabled={saving} className="w-full justify-center">
            {saving ? t("common.saving") : saved ? t("common.saved") : t("settings.business.saveChanges")}
          </Btn>
        )}
      </form>

      {showNewBusiness && <NewBusinessModal onClose={() => setShowNewBusiness(false)} />}
    </div>
  );
}
