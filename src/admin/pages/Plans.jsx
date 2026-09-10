import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Check, X, Copy, ArrowUp, ArrowDown, Trash2, Plus, Star } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, TextArea, Select, Modal, Field, Pill, IconButton, ConfirmDelete } from "../../components/ui";
import {
  fetchPlansFull, fetchPlanFeatureCatalog, upsertPlan, setPlanFeature,
  duplicatePlan, reorderPlans, deletePlan,
} from "../../lib/adminApi";
import { computeAnnualSavings } from "../../lib/plans";
import { formatMoney, CURRENCIES } from "../../lib/currencies";

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));

const BLANK_PLAN = {
  id: null, key: "", name: "", description: "", short_description: "",
  price_monthly: "", price_yearly: "", currency: "USD",
  max_customers: "", location_limit: "", user_limit: "", trial_days: "",
  badge_text: "", is_featured: false, is_active: true, sort_order: 0, features: [],
};

function LivePreviewCard({ form, enabledFeatures, catalog }) {
  const { t } = useTranslation();
  const isCustom = form.price_monthly === "" || form.price_monthly === null;
  const savings = !isCustom && form.price_yearly !== "" ? computeAnnualSavings(Number(form.price_monthly), Number(form.price_yearly)) : null;
  const featureNames = catalog.filter((f) => enabledFeatures.has(f.id)).map((f) => f.name);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: form.is_featured ? `2px solid ${C.green}` : `1px solid ${C.border}` }}>
      {form.badge_text && (
        <Pill color={C.green} bg={C.greenTint}>{form.badge_text}</Pill>
      )}
      <div className="mt-2 text-sm font-bold" style={{ color: C.ink }}>{form.name || t("admin.plans.editor.untitled")}</div>
      {form.short_description && <div className="mt-1 text-xs" style={{ color: C.slateLight }}>{form.short_description}</div>}
      <div className="mt-3 text-2xl font-bold" style={{ color: C.ink }}>
        {isCustom ? t("admin.plans.custom") : formatMoney(form.price_monthly, form.currency)}
        {!isCustom && <span className="text-xs font-normal" style={{ color: C.slateLight }}> {t("admin.plans.perMonth")}</span>}
      </div>
      {!isCustom && savings && savings.amount > 0 && (
        <div className="mt-1 text-xs font-semibold" style={{ color: C.green }}>
          {t("pricing.saveAmount", { amount: formatMoney(savings.amount, form.currency) })}
        </div>
      )}
      <div className="mt-2 text-xs" style={{ color: C.slateLight }}>
        {form.max_customers ? `${Number(form.max_customers).toLocaleString()} ${t("admin.plans.columnMaxCustomers").toLowerCase()}` : t("admin.plans.unlimited")}
      </div>
      <ul className="mt-3 space-y-1 text-xs" style={{ color: C.slate }}>
        {featureNames.slice(0, 8).map((f) => <li key={f} className="flex items-center gap-1.5"><Check size={12} color={C.green} />{f}</li>)}
        {featureNames.length > 8 && <li style={{ color: C.slateLight }}>+{featureNames.length - 8} {t("admin.plans.editor.more")}</li>}
      </ul>
    </div>
  );
}

function EditPlanModal({ plan, catalog, onClose, onSaved }) {
  const { t } = useTranslation();
  const isNew = !plan.id;
  const [form, setForm] = useState({
    id: plan.id, key: plan.key || "", name: plan.name || "", description: plan.description || "",
    short_description: plan.short_description || "",
    price_monthly: plan.price_monthly ?? "", price_yearly: plan.price_yearly ?? "", currency: plan.currency || "USD",
    max_customers: plan.max_customers ?? "", location_limit: plan.location_limit ?? "", user_limit: plan.user_limit ?? "",
    trial_days: plan.trial_days ?? "", badge_text: plan.badge_text || "",
    is_featured: !!plan.is_featured, is_active: plan.is_active ?? true, sort_order: plan.sort_order ?? 0,
  });
  const [enabledFeatures, setEnabledFeatures] = useState(
    new Set((plan.features || []).filter((f) => f.enabled).map((f) => f.feature_id))
  );
  const [savedId, setSavedId] = useState(plan.id || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pendingFeature, setPendingFeature] = useState(null);

  const categories = useMemo(() => {
    const byCategory = {};
    catalog.forEach((f) => { (byCategory[f.category] ||= []).push(f); });
    return byCategory;
  }, [catalog]);

  function unlimitedToggle(field) {
    setForm((f) => ({ ...f, [field]: f[field] === "" ? 0 : "" }));
  }

  async function handleSaveBasics() {
    setSaving(true);
    setError(null);
    try {
      const id = await upsertPlan(form);
      setSavedId(id);
      onSaved();
      if (isNew) return; // keep editor open so features can be wired up
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeature(feature) {
    if (!savedId) return;
    const nextEnabled = !enabledFeatures.has(feature.id);
    setPendingFeature(feature.id);
    try {
      await setPlanFeature(savedId, feature.id, nextEnabled, feature.display_order);
      setEnabledFeatures((prev) => {
        const next = new Set(prev);
        if (nextEnabled) next.add(feature.id); else next.delete(feature.id);
        return next;
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingFeature(null);
    }
  }

  return (
    <Modal title={isNew && !savedId ? t("admin.plans.addPlan") : t("admin.plans.editPlan")} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: C.slateLight }}>{t("admin.plans.editor.basicInfo")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("admin.plans.form.nameLabel")}><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
              <Field label={t("admin.plans.editor.keyLabel")}>
                <TextInput value={form.key} disabled={!isNew} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} />
              </Field>
              <Field label={t("admin.plans.editor.shortDescriptionLabel")} span><TextInput value={form.short_description} onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))} /></Field>
              <Field label={t("admin.plans.editor.descriptionLabel")} span><TextArea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
              <Field label={t("admin.plans.editor.badgeLabel")}><TextInput value={form.badge_text} onChange={(e) => setForm((f) => ({ ...f, badge_text: e.target.value }))} placeholder={t("admin.plans.editor.badgePlaceholder")} /></Field>
              <Field label={t("admin.plans.editor.sortOrderLabel")}><TextInput type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} /></Field>
            </div>
            <div className="mt-3 flex items-center gap-4 text-sm" style={{ color: C.slate }}>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />{t("admin.plans.form.activeLabel")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))} />{t("admin.plans.editor.featuredLabel")}</label>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: C.slateLight }}>{t("admin.plans.editor.pricing")}</h3>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("admin.plans.form.priceMonthlyLabel")}><TextInput type="number" value={form.price_monthly} onChange={(e) => setForm((f) => ({ ...f, price_monthly: e.target.value }))} placeholder={t("admin.plans.editor.customPricePlaceholder")} /></Field>
              <Field label={t("admin.plans.form.priceYearlyLabel")}><TextInput type="number" value={form.price_yearly} onChange={(e) => setForm((f) => ({ ...f, price_yearly: e.target.value }))} placeholder={t("admin.plans.editor.customPricePlaceholder")} /></Field>
              <Field label={t("admin.plans.form.currencyLabel")}><Select options={CURRENCY_OPTIONS} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></Field>
              <Field label={t("admin.plans.editor.trialDaysLabel")}><TextInput type="number" value={form.trial_days} onChange={(e) => setForm((f) => ({ ...f, trial_days: e.target.value }))} placeholder={t("admin.plans.editor.trialDaysPlaceholder")} /></Field>
            </div>
            {form.price_monthly !== "" && form.price_yearly !== "" && (
              <p className="mt-2 text-xs" style={{ color: C.green }}>
                {(() => {
                  const s = computeAnnualSavings(Number(form.price_monthly), Number(form.price_yearly));
                  return s && s.amount > 0 ? t("pricing.saveAmount", { amount: formatMoney(s.amount, form.currency) }) : null;
                })()}
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: C.slateLight }}>{t("admin.plans.editor.limits")}</h3>
            <div className="grid grid-cols-3 gap-3">
              {[["max_customers", t("admin.plans.form.maxCustomersLabel")], ["location_limit", t("admin.plans.editor.locationLimitLabel")], ["user_limit", t("admin.plans.editor.userLimitLabel")]].map(([field, label]) => (
                <Field key={field} label={label}>
                  <TextInput type="number" disabled={form[field] === ""} value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
                  <label className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: C.slateLight }}>
                    <input type="checkbox" checked={form[field] === ""} onChange={() => unlimitedToggle(field)} />{t("admin.plans.unlimited")}
                  </label>
                </Field>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: C.slateLight }}>{t("admin.plans.editor.features")}</h3>
            {!savedId ? (
              <p className="rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg, color: C.slateLight }}>{t("admin.plans.editor.saveFirstForFeatures")}</p>
            ) : (
              <div className="max-h-72 space-y-4 overflow-y-auto pe-1">
                {Object.entries(categories).map(([cat, feats]) => (
                  <div key={cat}>
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.slateLight }}>{t(`admin.plans.editor.categories.${cat}`, cat)}</div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {feats.map((f) => (
                        <label key={f.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs" style={{ backgroundColor: enabledFeatures.has(f.id) ? C.greenTint : C.bg }}>
                          <span style={{ color: C.ink }}>{f.name}</span>
                          <input type="checkbox" disabled={pendingFeature === f.id} checked={enabledFeatures.has(f.id)} onChange={() => toggleFeature(f)} />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}

          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={onClose}>{t("common.cancel")}</Btn>
            <Btn onClick={handleSaveBasics} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Btn>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: C.slateLight }}>{t("admin.plans.editor.livePreview")}</h3>
          <LivePreviewCard form={form} enabledFeatures={enabledFeatures} catalog={catalog} />
        </div>
      </div>
    </Modal>
  );
}

export default function Plans() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  function load() {
    Promise.all([fetchPlansFull(), fetchPlanFeatureCatalog()]).then(([p, c]) => {
      setPlans(p); setCatalog(c); setReady(true);
    });
  }
  useEffect(() => { load(); }, []);

  async function handleToggleActive(plan) {
    setBusyId(plan.id);
    try { await upsertPlan({ ...plan, is_active: !plan.is_active }); load(); }
    finally { setBusyId(null); }
  }

  async function handleDuplicate(plan) {
    setBusyId(plan.id);
    try { await duplicatePlan(plan.id); load(); }
    finally { setBusyId(null); }
  }

  async function handleMove(plan, direction) {
    const idx = plans.findIndex((p) => p.id === plan.id);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= plans.length) return;
    const reordered = [...plans];
    [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
    setPlans(reordered);
    await reorderPlans(reordered.map((p) => p.id));
    load();
  }

  async function handleDelete() {
    setDeleteError(null);
    try {
      await deletePlan(deleting.id);
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("admin.common.loading")}</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: C.slateLight }}>{t("admin.plans.subtitle")}</p>
        <Btn icon={Plus} onClick={() => setEditing(BLANK_PLAN)}>{t("admin.plans.addPlan")}</Btn>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b text-xs font-bold uppercase tracking-wide" style={{ borderColor: C.border, color: C.slateLight }}>
              {["", t("admin.plans.columnPlan"), t("admin.plans.columnMonthly"), t("admin.plans.columnYearly"),
                t("admin.plans.columnMaxCustomers"), t("admin.plans.editor.locationLimitLabel"),
                t("admin.plans.editor.trialDaysLabel"), t("admin.plans.editor.subscribers"),
                t("admin.plans.columnActive"), ""].map((h, i) => (
                <th key={i} className="whitespace-nowrap px-4 py-3 text-start">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((p, i) => (
              <tr key={p.id} className="border-b last:border-0" style={{ borderColor: C.border }}>
                <td className="px-2">
                  <div className="flex flex-col">
                    <button disabled={i === 0} onClick={() => handleMove(p, "up")} className="disabled:opacity-20"><ArrowUp size={13} color={C.slateLight} /></button>
                    <button disabled={i === plans.length - 1} onClick={() => handleMove(p, "down")} className="disabled:opacity-20"><ArrowDown size={13} color={C.slateLight} /></button>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-1.5 font-semibold" style={{ color: C.ink }}>
                    {p.name}
                    {p.is_featured && <Star size={12} color={C.amber} fill={C.amber} />}
                  </div>
                  {p.badge_text && <div className="text-[11px]" style={{ color: C.slateLight }}>{p.badge_text}</div>}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{p.price_monthly != null ? formatMoney(p.price_monthly, p.currency) : t("admin.plans.custom")}</td>
                <td className="whitespace-nowrap px-4 py-3">{p.price_yearly != null ? formatMoney(p.price_yearly, p.currency) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{p.max_customers ? p.max_customers.toLocaleString() : t("admin.plans.unlimited")}</td>
                <td className="whitespace-nowrap px-4 py-3">{p.location_limit || t("admin.plans.unlimited")}</td>
                <td className="whitespace-nowrap px-4 py-3">{p.trial_days || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{p.subscriber_count}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <button onClick={() => handleToggleActive(p)} disabled={busyId === p.id}>
                    <Pill color={p.is_active ? C.green : C.slateLight} bg={p.is_active ? C.greenTint : C.bg}>
                      {p.is_active ? <Check size={12} /> : <X size={12} />}
                    </Pill>
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-1">
                    <IconButton title={t("common.edit")} onClick={() => setEditing(p)}><Pencil size={15} /></IconButton>
                    <IconButton title={t("admin.plans.editor.duplicate")} onClick={() => handleDuplicate(p)}><Copy size={15} /></IconButton>
                    <IconButton title={t("common.delete")} danger onClick={() => { setDeleteError(null); setDeleting(p); }}><Trash2 size={15} /></IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditPlanModal
          plan={editing.id ? plans.find((p) => p.id === editing.id) || editing : editing}
          catalog={catalog}
          onClose={() => { setEditing(null); load(); }}
          onSaved={load}
        />
      )}

      {deleting && (
        <ConfirmDelete
          label={deleting.name}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
      {deleteError && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-xl px-4 py-2.5 text-xs font-semibold shadow-lg" style={{ backgroundColor: C.red, color: C.white }}>
          {deleteError}
        </div>
      )}
    </div>
  );
}
