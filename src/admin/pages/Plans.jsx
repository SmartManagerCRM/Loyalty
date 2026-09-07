import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Check, X } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, TextArea, Select, Modal, Field, Pill, IconButton } from "../../components/ui";
import { fetchPlans, updatePlan } from "../../lib/adminApi";
import { formatMoney } from "../../lib/currencies";
import { CURRENCIES } from "../../lib/currencies";

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));

function EditPlanModal({ plan, onClose, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: plan.name,
    price_monthly: plan.price_monthly ?? "",
    price_yearly: plan.price_yearly ?? "",
    currency: plan.currency,
    max_customers: plan.max_customers ?? "",
    features: (plan.features || []).join("\n"),
    is_active: plan.is_active,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updatePlan(plan.id, {
      name: form.name,
      price_monthly: form.price_monthly === "" ? null : Number(form.price_monthly),
      price_yearly: form.price_yearly === "" ? null : Number(form.price_yearly),
      currency: form.currency,
      max_customers: form.max_customers === "" ? null : Number(form.max_customers),
      features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
      is_active: form.is_active,
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal title={t("admin.plans.editPlan")} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <Field label={t("admin.plans.form.nameLabel")}><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("admin.plans.form.priceMonthlyLabel")}><TextInput type="number" value={form.price_monthly} onChange={(e) => setForm((f) => ({ ...f, price_monthly: e.target.value }))} /></Field>
          <Field label={t("admin.plans.form.priceYearlyLabel")}><TextInput type="number" value={form.price_yearly} onChange={(e) => setForm((f) => ({ ...f, price_yearly: e.target.value }))} /></Field>
          <Field label={t("admin.plans.form.currencyLabel")}><Select options={CURRENCY_OPTIONS} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></Field>
          <Field label={t("admin.plans.form.maxCustomersLabel")}><TextInput type="number" value={form.max_customers} onChange={(e) => setForm((f) => ({ ...f, max_customers: e.target.value }))} /></Field>
        </div>
        <Field label={t("admin.plans.form.featuresLabel")}><TextArea value={form.features} onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))} className="min-h-[100px]" /></Field>
        <label className="flex items-center gap-2 text-sm" style={{ color: C.slate }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          {t("admin.plans.form.activeLabel")}
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function Plans() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(null);

  function load() {
    fetchPlans({ includeInactive: true }).then((p) => { setPlans(p); setReady(true); });
  }
  useEffect(() => { load(); }, []);

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("admin.common.loading")}</div>;

  return (
    <div className="p-8">
      <p className="text-sm" style={{ color: C.slateLight }}>{t("admin.plans.subtitle")}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-start justify-between">
              <div className="text-sm font-bold" style={{ color: C.ink }}>{p.name}</div>
              <div className="flex items-center gap-1">
                <Pill color={p.is_active ? C.green : C.slateLight} bg={p.is_active ? C.greenTint : C.bg}>
                  {p.is_active ? <Check size={12} /> : <X size={12} />}
                </Pill>
                <IconButton title={t("common.edit")} onClick={() => setEditing(p)}><Pencil size={15} /></IconButton>
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold" style={{ color: C.ink }}>
              {p.price_monthly != null ? formatMoney(p.price_monthly, p.currency) : t("admin.plans.custom")}
              {p.price_monthly != null && <span className="text-xs font-normal" style={{ color: C.slateLight }}> {t("admin.plans.perMonth")}</span>}
            </div>
            <div className="mt-1 text-xs" style={{ color: C.slateLight }}>
              {p.max_customers ? `${p.max_customers.toLocaleString()} ${t("admin.plans.columnMaxCustomers").toLowerCase()}` : t("admin.plans.unlimited")}
            </div>
            <ul className="mt-3 space-y-1 text-xs" style={{ color: C.slate }}>
              {(p.features || []).map((f, i) => <li key={i}>• {f}</li>)}
            </ul>
          </div>
        ))}
      </div>

      {editing && <EditPlanModal plan={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
