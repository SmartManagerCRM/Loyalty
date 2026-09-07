import React, { useState } from "react";
import { Save, Plus } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Select, Field, Modal } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { CURRENCIES } from "../../lib/currencies";

const BUSINESS_TYPES = [
  { value: "clinic", label: "Clinic" }, { value: "dental", label: "Dental" }, { value: "physiotherapy", label: "Physiotherapy" },
  { value: "beauty_salon", label: "Beauty Salon" }, { value: "spa", label: "Spa" }, { value: "gym", label: "Gym" },
  { value: "barber", label: "Barber" }, { value: "car_service", label: "Car Service" }, { value: "training_center", label: "Training Center" },
  { value: "consultant", label: "Consultant" }, { value: "other", label: "Other" },
];
const VISIT_LABELS = ["Visit", "Appointment", "Session", "Service", "Purchase"];
const LANGUAGES = [{ value: "en", label: "English" }, { value: "ar", label: "Arabic" }];
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));

function NewBusinessModal({ onClose }) {
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
    <Modal title="Create another business" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <Field label="Business name" span><TextInput required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label="Business type"><Select options={BUSINESS_TYPES} value={form.businessType} onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))} /></Field>
        <Field label="What do you call a visit?"><Select options={VISIT_LABELS} value={form.visitLabel} onChange={(e) => setForm((f) => ({ ...f, visitLabel: e.target.value }))} /></Field>
        <Field label="Default language"><Select options={LANGUAGES} value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} /></Field>
        <Field label="Currency"><Select options={CURRENCY_OPTIONS} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></Field>
        {error && <p className="col-span-2 text-xs" style={{ color: C.red }}>{error}</p>}
        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={busy}>{busy ? "Creating…" : "Create business"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function BusinessSettings() {
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
        <Btn variant="secondary" icon={Plus} onClick={() => setShowNewBusiness(true)}>New business</Btn>
      </div>

      <form onSubmit={handleSave} className="mt-6 flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <Field label="Business name"><TextInput required disabled={!canEdit} value={form.name} onChange={set("name")} /></Field>
        <Field label="Business type"><Select options={BUSINESS_TYPES} disabled={!canEdit} value={form.business_type} onChange={set("business_type")} /></Field>
        <Field label="What do you call a visit?"><Select options={VISIT_LABELS} disabled={!canEdit} value={form.visit_label} onChange={set("visit_label")} /></Field>
        <Field label="Default language"><Select options={LANGUAGES} disabled={!canEdit} value={form.default_language} onChange={set("default_language")} /></Field>
        <Field label="Currency"><Select options={CURRENCY_OPTIONS} disabled={!canEdit} value={form.currency} onChange={set("currency")} /></Field>

        {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}
        {!canEdit && <p className="text-xs" style={{ color: C.slateLight }}>Only Owners and Admins can change business settings.</p>}

        {canEdit && (
          <Btn type="submit" icon={Save} disabled={saving} className="w-full justify-center">
            {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
          </Btn>
        )}
      </form>

      {showNewBusiness && <NewBusinessModal onClose={() => setShowNewBusiness(false)} />}
    </div>
  );
}
