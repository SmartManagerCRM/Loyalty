import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, UserPlus } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Modal, Field, Select } from "../../components/ui";
import { supabase } from "../../lib/supabaseClient";

function pad(n) { return String(n).padStart(2, "0"); }
function toDateValue(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateValue(dt);
}

// Assigns a membership_plans row to a customer as a new customer_memberships
// purchase. Plan fields are snapshotted onto the row at creation time (see
// schema.sql) so later plan edits never rewrite history for this sale.
export default function AssignMembershipModal({ business, customers, plans, onClose, onSaved }) {
  const { t } = useTranslation();

  const [customerId, setCustomerId] = useState(null);
  const [customerLabel, setCustomerLabel] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const [startsAt, setStartsAt] = useState(toDateValue(new Date()));
  const [pricePaid, setPricePaid] = useState(plans[0]?.price ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const plan = plans.find((p) => p.id === planId);
  const expiresAt = plan?.validity_days ? addDays(startsAt, plan.validity_days) : null;

  const matches = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => `${c.name} ${c.phone || ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [customers, customerSearch]);

  function selectPlan(id) {
    setPlanId(id);
    const p = plans.find((pl) => pl.id === id);
    if (p) setPricePaid(p.price ?? "");
  }

  async function resolveCustomerId() {
    if (!addingCustomer) return customerId;
    const { data, error } = await supabase
      .from("customers")
      .insert({ business_id: business.id, name: newCustomerName.trim(), phone: newCustomerPhone.trim() || null })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const finalCustomerId = await resolveCustomerId();
      if (!finalCustomerId) throw new Error(t("memberships.modal.errors.customerRequired"));
      if (!plan) throw new Error(t("memberships.modal.errors.planRequired"));

      const { error } = await supabase.from("customer_memberships").insert({
        business_id: business.id,
        customer_id: finalCustomerId,
        plan_id: plan.id,
        plan_name: plan.name,
        total_sessions: plan.total_sessions,
        sessions_used: 0,
        price_paid: pricePaid === "" ? 0 : Number(pricePaid),
        starts_at: startsAt,
        expires_at: expiresAt,
        notes: notes || null,
      });
      if (error) throw error;
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("memberships.modal.title")} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label={t("memberships.modal.customerLabel")}>
          {addingCustomer ? (
            <div className="flex flex-col gap-2 rounded-lg p-2" style={{ border: `1px solid ${C.border}` }}>
              <TextInput required placeholder={t("bookings.modal.newCustomerName")} value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
              <TextInput placeholder={t("bookings.modal.newCustomerPhone")} value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
              <button type="button" className="self-start text-xs font-semibold" style={{ color: C.slate }} onClick={() => setAddingCustomer(false)}>
                {t("bookings.modal.chooseExisting")}
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: C.slateLight }} />
                  <TextInput
                    className="ps-8"
                    placeholder={t("bookings.modal.searchCustomer")}
                    value={pickerOpen ? customerSearch : customerLabel}
                    onFocus={() => setPickerOpen(true)}
                    onChange={(e) => { setCustomerSearch(e.target.value); setPickerOpen(true); }}
                  />
                </div>
                <Btn type="button" variant="secondary" icon={UserPlus} onClick={() => { setAddingCustomer(true); setPickerOpen(false); }}>
                  {t("bookings.modal.newCustomer")}
                </Btn>
              </div>
              {pickerOpen && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg bg-white shadow-lg" style={{ border: `1px solid ${C.border}` }}>
                  {matches.length === 0 ? (
                    <div className="px-3 py-2 text-xs" style={{ color: C.slateLight }}>{t("common.noMatches")}</div>
                  ) : matches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full px-3 py-2 text-start text-sm hover:bg-black/5"
                      onClick={() => { setCustomerId(c.id); setCustomerLabel(c.name); setPickerOpen(false); setCustomerSearch(""); }}
                    >
                      <span className="font-semibold" style={{ color: C.ink }}>{c.name}</span>
                      {c.phone && <span className="ms-2 text-xs" style={{ color: C.slateLight }}>{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Field>

        <Field label={t("memberships.modal.planLabel")}>
          <Select value={planId} onChange={(e) => selectPlan(e.target.value)} options={plans.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>

        {plan && (
          <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: C.bg, color: C.slate }}>
            {plan.total_sessions ? t("memberships.modal.planSessionsSummary", { count: plan.total_sessions }) : t("memberships.modal.planUnlimitedSummary")}
            {" · "}
            {plan.validity_days ? t("memberships.modal.planValiditySummary", { count: plan.validity_days }) : t("memberships.modal.planNoExpirySummary")}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("memberships.modal.startsAtLabel")}>
            <TextInput type="date" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label={t("memberships.modal.pricePaidLabel")}>
            <TextInput type="number" step="0.01" min="0" value={pricePaid} onChange={(e) => setPricePaid(e.target.value)} />
          </Field>
        </div>

        {expiresAt && (
          <p className="text-xs" style={{ color: C.slateLight }}>{t("memberships.modal.expiresOn", { date: expiresAt })}</p>
        )}

        <Field label={t("memberships.modal.notesLabel")}>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <Btn variant="secondary" type="button" onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn type="submit" disabled={busy || !plan}>{busy ? t("common.saving") : t("common.save")}</Btn>
        </div>
      </form>
    </Modal>
  );
}
