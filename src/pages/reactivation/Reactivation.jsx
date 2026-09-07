import React, { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
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
import { formatMoney } from "../../lib/currencies";

const BUCKETS = [
  { key: "30", min: 30, max: 60 },
  { key: "60", min: 60, max: 90 },
  { key: "90", min: 90, max: 180 },
  { key: "long", min: 180, max: Infinity },
];

function MarkReactivatedModal({ customer, businessId, onClose }) {
  const { t } = useTranslation();
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
    <Modal title={t("reactivation.markReactivatedModal.title", { name: customer.name })} onClose={onClose}>
      <p className="text-sm" style={{ color: C.slate }}>{t("reactivation.markReactivatedModal.body")}</p>
      <Field label={t("reactivation.markReactivatedModal.amountLabel")}>
        <TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="secondary" onClick={onClose}>{t("common.cancel")}</Btn>
        <Btn onClick={handleConfirm} disabled={busy}>{busy ? t("common.saving") : t("common.confirm")}</Btn>
      </div>
    </Modal>
  );
}

export default function Reactivation() {
  const { t } = useTranslation();
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

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("reactivation.loading")}</div>;

  const visitLabel = business?.visit_label || "Visit";
  const total = buckets.reduce((n, b) => n + b.rows.length, 0);

  return (
    <div className="p-8">
      {total === 0 ? (
        <div className="mt-8"><EmptyState title={t("reactivation.emptyTitle")} subtitle={t("reactivation.emptySubtitle")} /></div>
      ) : (
        buckets.filter((b) => b.rows.length > 0).map((bucket) => (
          <div key={bucket.key} className="mt-8">
            <h2 className="text-sm font-bold" style={{ color: C.ink }}>{t(`reactivation.buckets.${bucket.key}`)} <span style={{ color: C.slateLight, fontWeight: 400 }}>({bucket.rows.length})</span></h2>
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
                          {t("reactivation.lastVisitInfo", {
                            visitLabel, days: row.days_since_last_visit,
                            cycle: row.avg_return_cycle_days ? Math.round(row.avg_return_cycle_days) : "—",
                            visits: row.total_visits, value: formatMoney(row.total_spending, business?.currency),
                          })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Btn variant="secondary" icon={RotateCcw} onClick={() => setReactivating(row)}>{t("reactivation.markReactivated")}</Btn>
                        <Btn
                          icon={MessageCircle}
                          disabled={!row.phone}
                          onClick={() => openWhatsApp(row.phone, generateMessage({
                            action: "REACTIVATE", customerName: row.name, businessName: business?.name,
                            days: row.days_since_last_visit, offer: offer?.text, language: business?.default_language,
                          }))}
                        >
                          {t("common.openWhatsApp")}
                        </Btn>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg }}>
                      <span className="font-bold" style={{ color: C.navy }}>{nba.action}</span>
                      <span style={{ color: C.slate }}> — {nba.reason}</span>
                      {offer && <div className="mt-1" style={{ color: C.slate }}><Trans t={t} i18nKey="reactivation.suggestedOffer" values={{ text: offer.text, reason: offer.reason }} components={{ b: <strong /> }} /></div>}
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
