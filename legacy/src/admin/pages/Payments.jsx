import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, TextArea, Select, Modal, Field, Pill } from "../../components/ui";
import { fetchPayments, fetchBusinesses, fetchPlans, recordPayment } from "../../lib/adminApi";
import { formatMoney, CURRENCIES } from "../../lib/currencies";

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
const STATUS_COLOR = { recorded: C.green, refunded: C.slateLight, failed: C.red };

function RecordPaymentModal({ businesses, plans, onClose, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    business_id: businesses[0]?.id || "", amount: "", currency: "USD", plan_id: "",
    period_start: "", period_end: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    await recordPayment({
      businessId: form.business_id,
      amount: Number(form.amount) || 0,
      currency: form.currency,
      planId: form.plan_id || null,
      periodStart: form.period_start || null,
      periodEnd: form.period_end || null,
      notes: form.notes || null,
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal title={t("admin.payments.form.title")} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <Field label={t("admin.payments.form.businessLabel")} span>
          <Select options={businesses.map((b) => ({ value: b.id, label: b.name }))} value={form.business_id} onChange={(e) => setForm((f) => ({ ...f, business_id: e.target.value }))} />
        </Field>
        <Field label={t("admin.payments.form.amountLabel")}><TextInput type="number" step="0.01" required value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></Field>
        <Field label={t("admin.payments.form.currencyLabel")}><Select options={CURRENCY_OPTIONS} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></Field>
        <Field label={t("admin.payments.form.planLabel")}>
          <Select options={[{ value: "", label: "—" }, ...plans.map((p) => ({ value: p.id, label: p.name }))]} value={form.plan_id} onChange={(e) => setForm((f) => ({ ...f, plan_id: e.target.value }))} />
        </Field>
        <Field label={t("admin.payments.form.periodStartLabel")}><TextInput type="date" value={form.period_start} onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))} /></Field>
        <Field label={t("admin.payments.form.periodEndLabel")}><TextInput type="date" value={form.period_end} onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))} /></Field>
        <Field label={t("admin.payments.form.notesLabel")} span><TextArea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Btn variant="secondary" type="button" onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn type="submit" disabled={saving}>{saving ? t("common.saving") : t("admin.payments.form.save")}</Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function Payments() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [plans, setPlans] = useState([]);
  const [ready, setReady] = useState(false);
  const [showRecord, setShowRecord] = useState(false);

  function load() {
    Promise.all([fetchPayments(), fetchBusinesses(), fetchPlans({ includeInactive: true })]).then(([p, b, pl]) => {
      setRows(p);
      setBusinesses(b);
      setPlans(pl);
      setReady(true);
    });
  }
  useEffect(() => { load(); }, []);

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("admin.common.loading")}</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: C.slateLight }}>{t("admin.payments.subtitle")}</p>
        <Btn icon={Plus} onClick={() => setShowRecord(true)}>{t("admin.payments.recordPayment")}</Btn>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: C.slateLight }}>{t("admin.payments.empty")}</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
                <th className="px-4 py-3">{t("admin.payments.columnBusiness")}</th>
                <th className="px-4 py-3">{t("admin.payments.columnAmount")}</th>
                <th className="px-4 py-3">{t("admin.payments.columnPlan")}</th>
                <th className="px-4 py-3">{t("admin.payments.columnPeriod")}</th>
                <th className="px-4 py-3">{t("admin.payments.columnStatus")}</th>
                <th className="px-4 py-3">{t("admin.payments.columnDate")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: C.ink }}>{p.business_name}</td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{p.plan_name || "—"}</td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{p.period_start && p.period_end ? `${p.period_start} → ${p.period_end}` : "—"}</td>
                  <td className="px-4 py-3"><Pill color={STATUS_COLOR[p.status]} bg={`${STATUS_COLOR[p.status]}1a`}>{t(`admin.payments.statuses.${p.status}`)}</Pill></td>
                  <td className="px-4 py-3" style={{ color: C.slateLight }}>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showRecord && <RecordPaymentModal businesses={businesses} plans={plans} onClose={() => setShowRecord(false)} onSaved={load} />}
    </div>
  );
}
