import React, { useMemo, useState } from "react";
import { MessageCircle, RotateCcw } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Field, Modal, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useCustomerOverview } from "../../lib/useCustomerOverview";
import { nextBestAction } from "../../lib/segmentation";
import { suggestOffer } from "../../lib/offerEngine";
import { generateMessage } from "../../lib/messageTemplates";
import { openWhatsApp } from "../../lib/whatsapp";
import { supabase } from "../../lib/supabaseClient";

const BUCKETS = [
  { key: "30", label: "30+ days inactive", min: 30, max: 60 },
  { key: "60", label: "60+ days inactive", min: 60, max: 90 },
  { key: "90", label: "90+ days inactive", min: 90, max: 180 },
  { key: "long", label: "Long-term lost (180+ days)", min: 180, max: Infinity },
];

function MarkReactivatedModal({ customer, businessId, onClose }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    if (Number(amount) > 0) {
      await supabase.from("customer_visits").insert({
        business_id: businessId, customer_id: customer.customer_id, amount: Number(amount), visit_date: new Date().toISOString().slice(0, 10), source: "manual",
      });
      await supabase.from("revenue_events").insert({
        business_id: businessId, customer_id: customer.customer_id, event_type: "reactivated", amount: Number(amount), notes: `Reactivated: ${customer.name}`,
      });
    }
    setBusy(false);
    onClose();
  }

  return (
    <Modal title={`Mark ${customer.name} as reactivated`} onClose={onClose}>
      <p className="text-sm" style={{ color: C.slate }}>Log the visit and its revenue — this powers Revenue Recovered and moves them out of the reactivation list.</p>
      <Field label="Visit amount">
        <TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleConfirm} disabled={busy}>{busy ? "Saving…" : "Confirm"}</Btn>
      </div>
    </Modal>
  );
}

export default function Reactivation() {
  const { business } = useAuth();
  const { rows, ready } = useCustomerOverview(business?.id);
  const [reactivating, setReactivating] = useState(null);

  const buckets = useMemo(() => {
    const inactive = rows.filter((r) => r.days_since_last_visit != null && r.days_since_last_visit >= 30);
    return BUCKETS.map((b) => ({
      ...b,
      rows: inactive.filter((r) => r.days_since_last_visit >= b.min && r.days_since_last_visit < b.max)
        .sort((a, b2) => Number(b2.total_spending || 0) - Number(a.total_spending || 0)),
    }));
  }, [rows]);

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>Loading…</div>;

  const visitLabel = business?.visit_label || "Visit";
  const total = buckets.reduce((n, b) => n + b.rows.length, 0);

  return (
    <div className="p-8">
      {total === 0 ? (
        <div className="mt-8"><EmptyState title="No inactive customers" subtitle="Everyone is within their normal return window." /></div>
      ) : (
        buckets.filter((b) => b.rows.length > 0).map((bucket) => (
          <div key={bucket.key} className="mt-8">
            <h2 className="text-sm font-bold" style={{ color: C.ink }}>{bucket.label} <span style={{ color: C.slateLight, fontWeight: 400 }}>({bucket.rows.length})</span></h2>
            <div className="mt-3 space-y-3">
              {bucket.rows.map((row) => {
                const nba = nextBestAction(row, { visitLabel });
                const offer = suggestOffer(row);
                return (
                  <div key={row.customer_id} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold" style={{ color: C.ink }}>{row.name}</div>
                        <div className="mt-1 text-xs" style={{ color: C.slateLight }}>
                          Last {visitLabel.toLowerCase()}: {row.days_since_last_visit} days ago · Normal cycle: {row.avg_return_cycle_days ? Math.round(row.avg_return_cycle_days) : "—"} days ·{" "}
                          {row.total_visits} past visits · Lifetime value: {business?.currency} {Number(row.total_spending || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Btn variant="secondary" icon={RotateCcw} onClick={() => setReactivating(row)}>Mark Reactivated</Btn>
                        <Btn
                          icon={MessageCircle}
                          disabled={!row.phone}
                          onClick={() => openWhatsApp(row.phone, generateMessage({
                            action: "REACTIVATE", customerName: row.name, businessName: business?.name,
                            days: row.days_since_last_visit, offer: offer?.text, language: business?.default_language,
                          }))}
                        >
                          Open WhatsApp
                        </Btn>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg }}>
                      <span className="font-bold" style={{ color: C.navy }}>{nba.action}</span>
                      <span style={{ color: C.slate }}> — {nba.reason}</span>
                      {offer && <div className="mt-1" style={{ color: C.slate }}>Suggested offer: <strong>{offer.text}</strong> ({offer.reason})</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {reactivating && (
        <MarkReactivatedModal customer={reactivating} businessId={business.id} onClose={() => setReactivating(null)} />
      )}
    </div>
  );
}
