import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, MessageCircle, Check } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, TextArea, Select, Modal, Field, Pill, ConfirmDelete, EmptyState, IconButton } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useBusinessTable } from "../../lib/useBusinessTable";
import { useCustomerOverview } from "../../lib/useCustomerOverview";
import { nextBestAction } from "../../lib/segmentation";
import { generateMessage } from "../../lib/messageTemplates";
import { openWhatsApp } from "../../lib/whatsapp";
import { supabase } from "../../lib/supabaseClient";

const SEGMENTS = ["new", "active", "due", "inactive", "lost", "vip", "high_value", "frequent", "at_risk"];
const SEGMENT_LABEL = { new: "New", active: "Active", due: "Due", inactive: "Inactive", lost: "Lost", vip: "VIP", high_value: "High Value", frequent: "Frequent", at_risk: "At Risk" };
const SEGMENT_ACTION = { inactive: "REACTIVATE", lost: "REACTIVATE", due: "CONTACT CUSTOMER", at_risk: "CONTACT CUSTOMER", vip: "VIP CARE", new: "ENCOURAGE SECOND VISIT", active: "CONTACT CUSTOMER", high_value: "VIP CARE", frequent: "ENCOURAGE SECOND VISIT" };

function emptyOffer() {
  return { name: "", trigger_segment: "inactive", offer_type: "reactivation", description: "", active: true };
}

function OfferForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex flex-col gap-3">
      <Field label="Offer name"><TextInput required value={form.name} onChange={set("name")} /></Field>
      <Field label="Triggers for segment">
        <Select options={SEGMENTS.map((s) => ({ value: s, label: SEGMENT_LABEL[s] }))} value={form.trigger_segment} onChange={set("trigger_segment")} />
      </Field>
      <Field label="Offer type"><TextInput value={form.offer_type} onChange={set("offer_type")} placeholder="e.g. discount, exclusive_benefit, free_upgrade" /></Field>
      <Field label="Description (what the customer gets)"><TextArea required value={form.description} onChange={set("description")} /></Field>
      <div className="mt-2 flex justify-end gap-2">
        <Btn variant="secondary" type="button" onClick={onCancel}>Cancel</Btn>
        <Btn type="submit">Save</Btn>
      </div>
    </form>
  );
}

function useRecommendationLog(businessId) {
  const [sentPairs, setSentPairs] = useState(new Set());
  async function refetch() {
    if (!businessId) return;
    const { data } = await supabase.from("offer_recommendations").select("customer_id, offer_id").eq("business_id", businessId).eq("action_taken", "sent");
    setSentPairs(new Set((data || []).map((r) => `${r.customer_id}:${r.offer_id}`)));
  }
  useEffect(() => { refetch(); }, [businessId]);
  return { sentPairs, refetch };
}

export default function Offers() {
  const { business } = useAuth();
  const { rows: offers, ready: offersReady, insertRow, updateRow, deleteRow } = useBusinessTable("offers", business?.id);
  const { rows: customers, ready: customersReady } = useCustomerOverview(business?.id);
  const { sentPairs, refetch: refetchLog } = useRecommendationLog(business?.id);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const recommendations = useMemo(() => {
    const active = offers.filter((o) => o.active);
    const out = [];
    for (const customer of customers) {
      for (const offer of active) {
        if (customer[`is_${offer.trigger_segment}`]) {
          out.push({ customer, offer, nba: nextBestAction(customer, { visitLabel: business?.visit_label }) });
        }
      }
    }
    return out;
  }, [offers, customers, business]);

  async function handleSend(customer, offer) {
    openWhatsApp(customer.phone, generateMessage({
      action: SEGMENT_ACTION[offer.trigger_segment] || "CONTACT CUSTOMER",
      customerName: customer.name, businessName: business?.name, days: customer.days_since_last_visit,
      offer: offer.description, language: business?.default_language,
    }));
    await supabase.from("offer_recommendations").insert({
      business_id: business.id, customer_id: customer.customer_id, offer_id: offer.id,
      reason_text: nextBestAction(customer, { visitLabel: business?.visit_label })?.reason, action_taken: "sent",
    });
    refetchLog();
  }

  if (!offersReady || !customersReady) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>Loading…</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.ink }}>Smart Offers</h1>
          <p className="mt-1 text-sm" style={{ color: C.slateLight }}>Offers matched to customer behavior — never a generic mass discount.</p>
        </div>
        <Btn icon={Plus} onClick={() => setEditing(emptyOffer())}>Add offer</Btn>
      </div>

      {offers.length === 0 ? (
        <div className="mt-6"><EmptyState title="No offers yet" subtitle="Create an offer and pick which customer segment it targets — recommendations appear below automatically." /></div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {offers.map((o) => (
            <div key={o.id} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold" style={{ color: C.ink }}>{o.name}</div>
                  <div className="mt-1 text-xs" style={{ color: C.slateLight }}>Triggers for: {SEGMENT_LABEL[o.trigger_segment]} · {o.description}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Pill color={o.active ? C.green : C.slateLight} bg={o.active ? C.greenTint : C.bg}>{o.active ? "Active" : "Inactive"}</Pill>
                  <IconButton title="Edit" onClick={() => setEditing(o)}><Pencil size={15} /></IconButton>
                  <IconButton title="Delete" danger onClick={() => setDeleting(o)}><Trash2 size={15} /></IconButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-sm font-bold" style={{ color: C.ink }}>Recommended right now</h2>
      {recommendations.length === 0 ? (
        <p className="mt-2 text-xs" style={{ color: C.slateLight }}>No customers currently match an active offer's trigger segment.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {recommendations.map(({ customer, offer, nba }) => {
            const alreadySent = sentPairs.has(`${customer.customer_id}:${offer.id}`);
            return (
              <div key={`${customer.customer_id}-${offer.id}`} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold" style={{ color: C.ink }}>{customer.name} <span style={{ color: C.slateLight, fontWeight: 400 }}>→ {offer.name}</span></div>
                    <div className="mt-1 text-xs" style={{ color: C.slate }}>Recommended because: {nba?.reason}</div>
                  </div>
                  <Btn
                    variant={alreadySent ? "secondary" : "primary"}
                    icon={alreadySent ? Check : MessageCircle}
                    disabled={!customer.phone}
                    onClick={() => handleSend(customer, offer)}
                  >
                    {alreadySent ? "Sent — send again" : "Open WhatsApp"}
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "Edit offer" : "Add offer"} onClose={() => setEditing(null)} wide>
          <OfferForm
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
        <ConfirmDelete label={deleting.name} onCancel={() => setDeleting(null)} onConfirm={async () => { await deleteRow(deleting.id); setDeleting(null); }} />
      )}
    </div>
  );
}
