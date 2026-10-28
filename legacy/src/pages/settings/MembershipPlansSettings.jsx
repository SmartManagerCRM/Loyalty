import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, TextArea, Modal, Field, Select, Pill, ConfirmDelete, EmptyState, IconButton } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useBusinessTable } from "../../lib/useBusinessTable";
import { formatMoney } from "../../lib/currencies";

function emptyPlan() {
  return { name: "", description: "", price: "", total_sessions: "", validity_days: "", service_id: "", active: true };
}

function PlanForm({ initial, services, onSave, onCancel }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initial);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex flex-col gap-3">
      <Field label={t("settings.membershipPlans.form.nameLabel")}>
        <TextInput required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("settings.membershipPlans.form.priceLabel")}>
          <TextInput type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
        </Field>
        <Field label={t("settings.membershipPlans.form.sessionsLabel")}>
          <TextInput type="number" min="1" step="1" placeholder={t("settings.membershipPlans.form.unlimitedPlaceholder")} value={form.total_sessions} onChange={(e) => setForm((f) => ({ ...f, total_sessions: e.target.value }))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("settings.membershipPlans.form.validityLabel")}>
          <TextInput type="number" min="1" step="1" placeholder={t("settings.membershipPlans.form.noExpiryPlaceholder")} value={form.validity_days} onChange={(e) => setForm((f) => ({ ...f, validity_days: e.target.value }))} />
        </Field>
        <Field label={t("settings.membershipPlans.form.serviceLabel")}>
          <Select
            value={form.service_id}
            onChange={(e) => setForm((f) => ({ ...f, service_id: e.target.value }))}
            options={[{ value: "", label: t("settings.membershipPlans.form.anyService") }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </Field>
      </div>
      <Field label={t("settings.membershipPlans.form.descriptionLabel")}>
        <TextArea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </Field>
      <label className="flex items-center gap-2 text-sm" style={{ color: C.slate }}>
        <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
        {t("settings.membershipPlans.form.activeLabel")}
      </label>
      <div className="mt-2 flex justify-end gap-2">
        <Btn variant="secondary" type="button" onClick={onCancel}>{t("common.cancel")}</Btn>
        <Btn type="submit">{t("common.save")}</Btn>
      </div>
    </form>
  );
}

export default function MembershipPlansSettings() {
  const { t } = useTranslation();
  const { business } = useAuth();
  const { rows, ready, insertRow, updateRow, deleteRow } = useBusinessTable("membership_plans", business?.id, { orderBy: "name", ascending: true });
  const { rows: services, ready: servicesReady } = useBusinessTable("services", business?.id, { orderBy: "name", ascending: true });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  if (!ready || !servicesReady) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("settings.membershipPlans.loading")}</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-xl text-sm" style={{ color: C.slateLight }}>{t("settings.membershipPlans.intro")}</p>
        <Btn icon={Plus} onClick={() => setEditing(emptyPlan())} className="shrink-0">{t("settings.membershipPlans.addPlan")}</Btn>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6"><EmptyState title={t("settings.membershipPlans.emptyTitle")} subtitle={t("settings.membershipPlans.emptySubtitle")} /></div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
                <th className="px-4 py-3">{t("settings.membershipPlans.columnName")}</th>
                <th className="px-4 py-3">{t("settings.membershipPlans.columnPrice")}</th>
                <th className="px-4 py-3">{t("settings.membershipPlans.columnSessions")}</th>
                <th className="px-4 py-3">{t("settings.membershipPlans.columnValidity")}</th>
                <th className="px-4 py-3">{t("settings.membershipPlans.columnStatus")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="px-4 py-3">
                    <div className="font-semibold" style={{ color: C.ink }}><bdi>{p.name}</bdi></div>
                    {p.description && <div className="text-xs" style={{ color: C.slateLight }}><bdi>{p.description}</bdi></div>}
                  </td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{formatMoney(p.price, business?.currency)}</td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{p.total_sessions ?? t("settings.membershipPlans.unlimited")}</td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{p.validity_days ? t("settings.membershipPlans.daysValue", { count: p.validity_days }) : t("settings.membershipPlans.noExpiry")}</td>
                  <td className="px-4 py-3">
                    <Pill color={p.active ? C.green : C.slateLight} bg={p.active ? C.greenTint : C.bg}>{p.active ? t("common.active") : t("common.inactive")}</Pill>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <IconButton title={t("common.edit")} onClick={() => setEditing(p)}><Pencil size={15} /></IconButton>
                    <IconButton title={t("common.delete")} danger onClick={() => setDeleting(p)}><Trash2 size={15} /></IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? t("settings.membershipPlans.editPlan") : t("settings.membershipPlans.addPlan")} onClose={() => setEditing(null)}>
          <PlanForm
            initial={editing}
            services={services}
            onCancel={() => setEditing(null)}
            onSave={async (form) => {
              const payload = {
                ...form,
                price: form.price === "" ? 0 : Number(form.price),
                total_sessions: form.total_sessions === "" ? null : Number(form.total_sessions),
                validity_days: form.validity_days === "" ? null : Number(form.validity_days),
                service_id: form.service_id || null,
              };
              if (editing.id) await updateRow(editing.id, payload);
              else await insertRow(payload);
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDelete label={deleting.name} onCancel={() => setDeleting(null)} onConfirm={async () => { await deleteRow(deleting.id); setDeleting(null); }} />
      )}
    </div>
  );
}
