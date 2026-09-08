import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, TextArea, Modal, Field, Pill, ConfirmDelete, EmptyState, IconButton } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useBusinessTable } from "../../lib/useBusinessTable";
import { formatMoney } from "../../lib/currencies";

function emptyService() {
  return { name: "", description: "", price: "", active: true };
}

function ServiceForm({ initial, onSave, onCancel }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initial);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex flex-col gap-3">
      <Field label={t("settings.services.form.nameLabel")}>
        <TextInput required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </Field>
      <Field label={t("settings.services.form.priceLabel")}>
        <TextInput type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
      </Field>
      <Field label={t("settings.services.form.descriptionLabel")}>
        <TextArea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </Field>
      <label className="flex items-center gap-2 text-sm" style={{ color: C.slate }}>
        <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
        {t("settings.services.form.activeLabel")}
      </label>
      <div className="mt-2 flex justify-end gap-2">
        <Btn variant="secondary" type="button" onClick={onCancel}>{t("common.cancel")}</Btn>
        <Btn type="submit">{t("common.save")}</Btn>
      </div>
    </form>
  );
}

export default function ServicesSettings() {
  const { t } = useTranslation();
  const { business } = useAuth();
  const { rows, ready, insertRow, updateRow, deleteRow } = useBusinessTable("services", business?.id, { orderBy: "name", ascending: true });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("settings.services.loading")}</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-xl text-sm" style={{ color: C.slateLight }}>{t("settings.services.intro")}</p>
        <Btn icon={Plus} onClick={() => setEditing(emptyService())} className="shrink-0">{t("settings.services.addService")}</Btn>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6"><EmptyState title={t("settings.services.emptyTitle")} subtitle={t("settings.services.emptySubtitle")} /></div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
                <th className="px-4 py-3">{t("settings.services.columnName")}</th>
                <th className="px-4 py-3">{t("settings.services.columnPrice")}</th>
                <th className="px-4 py-3">{t("settings.services.columnStatus")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="px-4 py-3">
                    <div className="font-semibold" style={{ color: C.ink }}>{s.name}</div>
                    {s.description && <div className="text-xs" style={{ color: C.slateLight }}>{s.description}</div>}
                  </td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{s.price != null ? formatMoney(s.price, business?.currency) : "—"}</td>
                  <td className="px-4 py-3">
                    <Pill color={s.active ? C.green : C.slateLight} bg={s.active ? C.greenTint : C.bg}>{s.active ? t("common.active") : t("common.inactive")}</Pill>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <IconButton title={t("common.edit")} onClick={() => setEditing(s)}><Pencil size={15} /></IconButton>
                    <IconButton title={t("common.delete")} danger onClick={() => setDeleting(s)}><Trash2 size={15} /></IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? t("settings.services.editService") : t("settings.services.addService")} onClose={() => setEditing(null)}>
          <ServiceForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (form) => {
              const payload = { ...form, price: form.price === "" ? null : Number(form.price) };
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
