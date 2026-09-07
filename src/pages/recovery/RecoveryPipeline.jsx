import React, { useMemo, useState } from "react";
import { Plus, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, TextArea, Select, Modal, Field, Pill, ConfirmDelete, EmptyState, IconButton } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useBusinessTable } from "../../lib/useBusinessTable";
import { generateRecoveryMessage } from "../../lib/messageTemplates";
import { openWhatsApp } from "../../lib/whatsapp";
import { supabase } from "../../lib/supabaseClient";

const STATUSES = ["New", "Contacted", "Interested", "Follow-up Required", "Converted", "Lost"];
const STATUS_COLOR = {
  New: C.slate, Contacted: "#4E86B0", Interested: C.teal, "Follow-up Required": C.amber,
  Converted: C.green, Lost: C.red,
};

function daysAgo(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
}

function needsFollowUp(row) {
  if (["Converted", "Lost"].includes(row.status)) return false;
  const since = daysAgo(row.last_contact_date || row.inquiry_date);
  return since !== null && since >= 5;
}

function emptyLead() {
  return { name: "", phone: "", source: "", interested_service: "", inquiry_date: new Date().toISOString().slice(0, 10), last_contact_date: "", estimated_value: "", status: "New", notes: "" };
}

function LeadForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="grid grid-cols-2 gap-3">
      <Field label="Name" span><TextInput required value={form.name} onChange={set("name")} /></Field>
      <Field label="Phone"><TextInput value={form.phone} onChange={set("phone")} /></Field>
      <Field label="Source"><TextInput value={form.source} onChange={set("source")} placeholder="e.g. Instagram DM" /></Field>
      <Field label="Interested service" span><TextInput value={form.interested_service} onChange={set("interested_service")} /></Field>
      <Field label="Inquiry date"><TextInput type="date" value={form.inquiry_date} onChange={set("inquiry_date")} /></Field>
      <Field label="Last contact"><TextInput type="date" value={form.last_contact_date || ""} onChange={set("last_contact_date")} /></Field>
      <Field label="Estimated value"><TextInput type="number" step="0.01" value={form.estimated_value} onChange={set("estimated_value")} /></Field>
      <Field label="Status"><Select options={STATUSES} value={form.status} onChange={set("status")} /></Field>
      <Field label="Notes" span><TextArea value={form.notes || ""} onChange={set("notes")} /></Field>
      <div className="col-span-2 mt-2 flex justify-end gap-2">
        <Btn variant="secondary" type="button" onClick={onCancel}>Cancel</Btn>
        <Btn type="submit">Save</Btn>
      </div>
    </form>
  );
}

function ConvertModal({ lead, businessId, onClose, onDone }) {
  const [amount, setAmount] = useState(lead.estimated_value || "");
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    await supabase.from("recovery_opportunities").update({ status: "Converted" }).eq("id", lead.id);
    if (Number(amount) > 0) {
      await supabase.from("revenue_events").insert({
        business_id: businessId, event_type: "recovered", amount: Number(amount), related_recovery_id: lead.id, notes: `Recovered lead: ${lead.name}`,
      });
    }
    setBusy(false);
    onDone();
    onClose();
  }

  return (
    <Modal title="Mark as converted" onClose={onClose}>
      <p className="text-sm" style={{ color: C.slate }}>Record the revenue this recovered lead brought in — it powers the Revenue Recovered stat on the dashboard.</p>
      <Field label="Revenue amount">
        <TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleConfirm} disabled={busy}>{busy ? "Saving…" : "Confirm"}</Btn>
      </div>
    </Modal>
  );
}

export default function RecoveryPipeline() {
  const { business } = useAuth();
  const { rows, ready, insertRow, updateRow, deleteRow } = useBusinessTable("recovery_opportunities", business?.id);
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [converting, setConverting] = useState(null);

  const filtered = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter]
  );

  return (
    <div className="p-8">
      <div className="flex justify-end">
        <Btn icon={Plus} onClick={() => setEditing(emptyLead())}>Add lead</Btn>
      </div>

      <div className="mt-5">
        <Select options={["all", ...STATUSES]} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-56" />
      </div>

      {!ready ? (
        <p className="mt-8 text-sm" style={{ color: C.slateLight }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8"><EmptyState title="No recovery opportunities" subtitle="Leads who asked about a service but didn't book will show up here." /></div>
      ) : (
        <div className="mt-5 space-y-3">
          {filtered.map((row) => (
            <div key={row.id} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: C.ink }}>{row.name}</span>
                    <Pill color={STATUS_COLOR[row.status]} bg={`${STATUS_COLOR[row.status]}1a`}>{row.status}</Pill>
                    {needsFollowUp(row) && <Pill color={C.red} bg="#C63B3B1a">FOLLOW UP NOW</Pill>}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: C.slateLight }}>
                    {row.interested_service && `Interested in: ${row.interested_service} · `}
                    {row.source && `Source: ${row.source} · `}
                    Last contact: {row.last_contact_date ? `${daysAgo(row.last_contact_date)} days ago` : "never"}
                    {row.estimated_value > 0 && ` · Est. value: ${business?.currency} ${Number(row.estimated_value).toLocaleString()}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Select
                    options={STATUSES}
                    value={row.status}
                    onChange={(e) => {
                      if (e.target.value === "Converted") setConverting(row);
                      else updateRow(row.id, { status: e.target.value });
                    }}
                    className="w-44"
                  />
                  <IconButton title="Edit" onClick={() => setEditing(row)}><Pencil size={15} /></IconButton>
                  <IconButton title="Delete" danger onClick={() => setDeleting(row)}><Trash2 size={15} /></IconButton>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Btn
                  variant="secondary"
                  icon={MessageCircle}
                  disabled={!row.phone}
                  onClick={() => openWhatsApp(row.phone, generateRecoveryMessage({
                    leadName: row.name, businessName: business?.name, interestedService: row.interested_service, language: business?.default_language,
                  }))}
                >
                  Open WhatsApp
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "Edit lead" : "Add lead"} onClose={() => setEditing(null)} wide>
          <LeadForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (form) => {
              const payload = { ...form, estimated_value: Number(form.estimated_value) || 0, last_contact_date: form.last_contact_date || null };
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

      {converting && (
        <ConvertModal lead={converting} businessId={business.id} onClose={() => setConverting(null)} onDone={() => {}} />
      )}
    </div>
  );
}
