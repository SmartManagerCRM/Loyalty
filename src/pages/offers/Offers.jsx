import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
const SEGMENT_ACTION = { inactive: "REACTIVATE", lost: "REACTIVATE", due: "CONTACT CUSTOMER", at_risk: "CONTACT CUSTOMER", vip: "VIP CARE", new: "ENCOURAGE SECOND VISIT", active: "CONTACT CUSTOMER", high_value: "VIP CARE", frequent: "ENCOURAGE SECOND VISIT" };

function emptyOffer() {
  return { name: "", trigger_segment: "inactive", offer_type: "reactivation", description: "", active: true };
}

// Which revenue_events bucket an offer conversion counts as, based on the
// segment it targeted — related_offer_id (set below) is what actually
// makes it count toward "Revenue generated from offers" on Analytics;
// event_type just keeps it consistent with Recovery/Reactivation/VIP.
function eventTypeFor(segment) {
  if (segment === "inactive" || segment === "lost") return "reactivated";
  if (segment === "vip" || segment === "high_value") return "vip_revenue";
  return "repeat_purchase";
}

function ConvertOfferModal({ customer, offer, businessId, onClose, onDone }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    if (Number(amount) > 0) {
      await supabase.from("revenue_events").insert({
        business_id: businessId, customer_id: customer.customer_id,
        event_type: eventTypeFor(offer.trigger_segment), amount: Number(amount),
        related_offer_id: offer.id, notes: `${offer.name} converted by ${customer.name}`,
      });
    }
    await supabase.from("offer_recommendations").insert({
      business_id: businessId, customer_id: customer.customer_id, offer_id: offer.id, action_taken: "converted",
    });
    setBusy(false);
    onDone();
    onClose();
  }

  return (
    <Modal title={t("offers.convertModal.title")} onClose={onClose}>
      <p className="text-sm" style={{ color: C.slate }}>{t("offers.convertModal.body")}</p>
      <Field label={t("offers.convertModal.amountLabel")}>
        <TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="secondary" onClick={onClose}>{t("common.cancel")}</Btn>
        <Btn onClick={handleConfirm} disabled={busy}>{busy ? t("common.saving") : t("common.confirm")}</Btn>
      </div>
    </Modal>
  );
}

function OfferForm({ initial, onSave, onCancel }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex flex-col gap-3">
      <Field label={t("offers.form.offerNameLabel")}><TextInput required value={form.name} onChange={set("name")} /></Field>
      <Field label={t("offers.form.triggersForSegmentLabel")}>
        <Select options={SEGMENTS.map((s) => ({ value: s, label: t(`segments.${s}`) }))} value={form.trigger_segment} onChange={set("trigger_segment")} />
      </Field>
      <Field label={t("offers.form.offerTypeLabel")}><TextInput value={form.offer_type} onChange={set("offer_type")} placeholder={t("offers.form.offerTypePlaceholder")} /></Field>
      <Field label={t("offers.form.descriptionLabel")}><TextArea required value={form.description} onChange={set("description")} /></Field>
      <div className="mt-2 flex justify-end gap-2">
        <Btn variant="secondary" type="button" onClick={onCancel}>{t("common.cancel")}</Btn>
        <Btn type="submit">{t("common.save")}</Btn>
      </div>
    </form>
  );
}

function useRecommendationLog(businessId) {
  const [sentPairs, setSentPairs] = useState(new Set());
  const [convertedPairs, setConvertedPairs] = useState(new Set());
  async function refetch() {
    if (!businessId) return;
    const { data } = await supabase.from("offer_recommendations").select("customer_id, offer_id, action_taken").eq("business_id", businessId).in("action_taken", ["sent", "converted"]);
    setSentPairs(new Set((data || []).filter((r) => r.action_taken === "sent").map((r) => `${r.customer_id}:${r.offer_id}`)));
    setConvertedPairs(new Set((data || []).filter((r) => r.action_taken === "converted").map((r) => `${r.customer_id}:${r.offer_id}`)));
  }
  useEffect(() => { refetch(); }, [businessId]);
  return { sentPairs, convertedPairs, refetch };
}

export default function Offers() {
  const { t } = useTranslation();
  const { business } = useAuth();
  const { rows: offers, ready: offersReady, insertRow, updateRow, deleteRow } = useBusinessTable("offers", business?.id);
  const { rows: customers, ready: customersReady } = useCustomerOverview(business?.id);
  const { sentPairs, convertedPairs, refetch: refetchLog } = useRecommendationLog(business?.id);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [converting, setConverting] = useState(null);

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

  if (!offersReady || !customersReady) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("offers.loading")}</div>;

  return (
    <div className="p-8">
      <div className="flex justify-end">
        <Btn icon={Plus} onClick={() => setEditing(emptyOffer())}>{t("offers.addOffer")}</Btn>
      </div>

      {offers.length === 0 ? (
        <div className="mt-6"><EmptyState title={t("offers.emptyTitle")} subtitle={t("offers.emptySubtitle")} /></div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {offers.map((o) => (
            <div key={o.id} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold" style={{ color: C.ink }}>{o.name}</div>
                  <div className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("offers.triggersFor", { segment: t(`segments.${o.trigger_segment}`), description: o.description })}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Pill color={o.active ? C.green : C.slateLight} bg={o.active ? C.greenTint : C.bg}>{o.active ? t("common.active") : t("common.inactive")}</Pill>
                  <IconButton title={t("common.edit")} onClick={() => setEditing(o)}><Pencil size={15} /></IconButton>
                  <IconButton title={t("common.delete")} danger onClick={() => setDeleting(o)}><Trash2 size={15} /></IconButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-sm font-bold" style={{ color: C.ink }}>{t("offers.recommendedNow")}</h2>
      {recommendations.length === 0 ? (
        <p className="mt-2 text-xs" style={{ color: C.slateLight }}>{t("offers.noRecommendations")}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {recommendations.map(({ customer, offer, nba }) => {
            const pairKey = `${customer.customer_id}:${offer.id}`;
            const alreadySent = sentPairs.has(pairKey);
            const alreadyConverted = convertedPairs.has(pairKey);
            return (
              <div key={pairKey} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: C.ink }}>{customer.name}</span>
                      <span className="text-xs" style={{ color: C.slateLight }}>→ {offer.name}</span>
                      {alreadyConverted && <Pill color={C.green} bg={C.greenTint}>{t("offers.converted")}</Pill>}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: C.slate }}>{t("offers.recommendedBecause", { reason: nba?.reason })}</div>
                  </div>
                  <div className="flex gap-2">
                    <Btn
                      variant={alreadySent ? "secondary" : "primary"}
                      icon={alreadySent ? Check : MessageCircle}
                      disabled={!customer.phone}
                      onClick={() => handleSend(customer, offer)}
                    >
                      {alreadySent ? t("offers.sentSendAgain") : t("common.openWhatsApp")}
                    </Btn>
                    {alreadySent && !alreadyConverted && (
                      <Btn variant="secondary" onClick={() => setConverting({ customer, offer })}>{t("offers.markConverted")}</Btn>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? t("offers.editOffer") : t("offers.addOffer")} onClose={() => setEditing(null)} wide>
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
      {converting && (
        <ConvertOfferModal
          customer={converting.customer} offer={converting.offer} businessId={business.id}
          onClose={() => setConverting(null)} onDone={refetchLog}
        />
      )}
    </div>
  );
}
