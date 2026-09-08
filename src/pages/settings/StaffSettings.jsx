import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Modal, Field, Pill, ConfirmDelete, EmptyState, IconButton } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useBusinessTable } from "../../lib/useBusinessTable";

function emptyStaff() {
  return { name: "", role: "", active: true };
}

function StaffForm({ initial, onSave, onCancel }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initial);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex flex-col gap-3">
      <Field label={t("settings.staff.form.nameLabel")}>
        <TextInput required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </Field>
      <Field label={t("settings.staff.form.roleLabel")}>
        <TextInput value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
      </Field>
      <label className="flex items-center gap-2 text-sm" style={{ color: C.slate }}>
        <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
        {t("settings.staff.form.activeLabel")}
      </label>
      <div className="mt-2 flex justify-end gap-2">
        <Btn variant="secondary" type="button" onClick={onCancel}>{t("common.cancel")}</Btn>
        <Btn type="submit">{t("common.save")}</Btn>
      </div>
    </form>
  );
}

export default function StaffSettings() {
  const { t } = useTranslation();
  const { business } = useAuth();
  const { rows, ready, insertRow, updateRow, deleteRow } = useBusinessTable("staff", business?.id, { orderBy: "name", ascending: true });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("settings.staff.loading")}</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-xl text-sm" style={{ color: C.slateLight }}>{t("settings.staff.intro")}</p>
        <Btn icon={Plus} onClick={() => setEditing(emptyStaff())} className="shrink-0">{t("settings.staff.addStaff")}</Btn>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6"><EmptyState title={t("settings.staff.emptyTitle")} subtitle={t("settings.staff.emptySubtitle")} /></div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
                <th className="px-4 py-3">{t("settings.staff.columnName")}</th>
                <th className="px-4 py-3">{t("settings.staff.columnRole")}</th>
                <th className="px-4 py-3">{t("settings.staff.columnStatus")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: C.ink }}>{s.name}</td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{s.role || "—"}</td>
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
        <Modal title={editing.id ? t("settings.staff.editStaff") : t("settings.staff.addStaff")} onClose={() => setEditing(null)}>
          <StaffForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (form) => {
              const payload = { ...form, role: form.role || null };
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
