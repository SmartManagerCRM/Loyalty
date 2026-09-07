import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, MessageCircle, Check } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Modal, Field, Pill, ConfirmDelete, EmptyState, IconButton } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useBusinessTable } from "../../lib/useBusinessTable";
import { useCustomerOverview } from "../../lib/useCustomerOverview";
import { qualifyingTier, vipAction } from "../../lib/vip";
import { generateMessage } from "../../lib/messageTemplates";
import { openWhatsApp } from "../../lib/whatsapp";
import { supabase } from "../../lib/supabaseClient";
import { formatMoney } from "../../lib/currencies";

function emptyTier() {
  return { tier_name: "", criteria: { min_spending: 1000 }, sort_order: 1 };
}

function TierForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="grid grid-cols-2 gap-3">
      <Field label="Tier name" span><TextInput required value={form.tier_name} onChange={(e) => setForm((f) => ({ ...f, tier_name: e.target.value }))} /></Field>
      <Field label="Minimum lifetime spending">
        <TextInput type="number" value={form.criteria.min_spending ?? ""} onChange={(e) => setForm((f) => ({ ...f, criteria: { ...f.criteria, min_spending: Number(e.target.value) || 0 } }))} />
      </Field>
      <Field label="Sort order (higher = better tier)">
        <TextInput type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))} />
      </Field>
      <div className="col-span-2 mt-2 flex justify-end gap-2">
        <Btn variant="secondary" type="button" onClick={onCancel}>Cancel</Btn>
        <Btn type="submit">Save</Btn>
      </div>
    </form>
  );
}

function useVipStatus(businessId) {
  const [byCustomer, setByCustomer] = useState({});
  async function refetch() {
    if (!businessId) return;
    const { data } = await supabase.from("customer_vip_status").select("*").eq("business_id", businessId);
    const map = {};
    for (const row of data || []) map[row.customer_id] = row;
    setByCustomer(map);
  }
  useEffect(() => { refetch(); }, [businessId]);
  return { byCustomer, refetch };
}

export default function VIP() {
  const { business } = useAuth();
  const { rows: tiers, ready: tiersReady, insertRow, updateRow, deleteRow } = useBusinessTable("vip_tiers", business?.id, { orderBy: "sort_order", ascending: true });
  const { rows: customers, ready: customersReady } = useCustomerOverview(business?.id);
  const { byCustomer: statusByCustomer, refetch: refetchStatus } = useVipStatus(business?.id);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const vipCustomers = useMemo(() => {
    return customers
      .map((c) => ({ ...c, tier: qualifyingTier(c.total_spending, tiers) }))
      .filter((c) => c.tier)
      .sort((a, b) => (b.tier.sort_order - a.tier.sort_order) || (Number(b.total_spending) - Number(a.total_spending)));
  }, [customers, tiers]);

  async function assignTier(customerId, tierId) {
    await supabase.from("customer_vip_status").upsert({ customer_id: customerId, business_id: business.id, tier_id: tierId });
    refetchStatus();
  }

  return (
    <div className="p-8">
      <div className="flex justify-end">
        <Btn icon={Plus} onClick={() => setEditing(emptyTier())}>Add tier</Btn>
      </div>

      {tiersReady && (
        <div className="mt-5 flex flex-wrap gap-2">
          {tiers.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: C.white, border: `1px solid ${C.border}` }}>
              <span className="text-sm font-bold" style={{ color: C.gold }}>{t.tier_name}</span>
              <span className="text-xs" style={{ color: C.slateLight }}>{formatMoney(t.criteria?.min_spending, business?.currency)}+</span>
              <IconButton title="Edit" onClick={() => setEditing(t)}><Pencil size={13} /></IconButton>
              <IconButton title="Delete" danger onClick={() => setDeleting(t)}><Trash2 size={13} /></IconButton>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-sm font-bold" style={{ color: C.ink }}>VIP Customers</h2>
      {!customersReady ? (
        <p className="mt-2 text-xs" style={{ color: C.slateLight }}>Loading…</p>
      ) : vipCustomers.length === 0 ? (
        <div className="mt-3"><EmptyState title="No VIP customers yet" subtitle="Customers who cross a tier's spending threshold will show up here." /></div>
      ) : (
        <div className="mt-3 space-y-3">
          {vipCustomers.map((c) => {
            const assignedTierId = statusByCustomer[c.customer_id]?.tier_id;
            const isAssigned = assignedTierId === c.tier.id;
            const action = vipAction(c.tier.tier_name);
            return (
              <div key={c.customer_id} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: C.ink }}>{c.name}</span>
                      <Pill color={C.gold} bg="#B8923A1a">{c.tier.tier_name}</Pill>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: C.slateLight }}>
                      {formatMoney(c.total_spending, business?.currency)} lifetime · {c.total_visits} visits · last visit {c.days_since_last_visit != null ? `${c.days_since_last_visit}d ago` : "—"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Btn variant={isAssigned ? "secondary" : "primary"} icon={Check} disabled={isAssigned} onClick={() => assignTier(c.customer_id, c.tier.id)}>
                      {isAssigned ? "Assigned" : "Confirm tier"}
                    </Btn>
                    <Btn
                      variant="secondary"
                      icon={MessageCircle}
                      disabled={!c.phone}
                      onClick={() => openWhatsApp(c.phone, generateMessage({ action: "VIP CARE", customerName: c.name, businessName: business?.name, language: business?.default_language }))}
                    >
                      Open WhatsApp
                    </Btn>
                  </div>
                </div>
                <div className="mt-3 rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg }}>
                  <span className="font-bold" style={{ color: C.navy }}>{action.action}</span>
                  <span style={{ color: C.slate }}> — {action.detail}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "Edit tier" : "Add tier"} onClose={() => setEditing(null)}>
          <TierForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (form) => {
              if (editing.id) await updateRow(editing.id, form);
              else await insertRow(form);
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDelete label={deleting.tier_name} onCancel={() => setDeleting(null)} onConfirm={async () => { await deleteRow(deleting.id); setDeleting(null); }} />
      )}
    </div>
  );
}
