import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, UserPlus, MessageCircle } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Modal, Field, Select, Pill } from "../../components/ui";
import { supabase } from "../../lib/supabaseClient";
import { openWhatsApp } from "../../lib/whatsapp";

function pad(n) { return String(n).padStart(2, "0"); }
function toDateValue(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toTimeValue(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function combine(dateStr, timeStr) {
  const [y, m, day] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, day, h, min, 0, 0);
}

const STATUS_KEYS = ["pending", "confirmed", "completed", "cancelled", "no_show"];
const LOCKED_STATUSES = ["completed", "cancelled", "no_show"];

// Handles create, edit, reschedule, cancel, no-show and complete — the one
// modal for every booking mutation. "Complete" always goes through the
// complete_booking() RPC (never a raw status update) so the customer_visits
// row it writes stays the single source of truth for loyalty segmentation.
export default function BookingModal({ business, booking, customers, services, staffList, memberships, defaultStart, onClose, onSaved }) {
  const { t } = useTranslation();
  const isEdit = Boolean(booking?.id);
  const locked = isEdit && LOCKED_STATUSES.includes(booking.status);

  const initialCustomer = booking?.customers || null;
  const initialService = services.find((s) => s.id === booking?.service_id) || null;
  const start = booking ? new Date(booking.start_at) : (defaultStart || new Date());
  const initialDuration = booking
    ? Math.round((new Date(booking.end_at) - new Date(booking.start_at)) / 60000)
    : (initialService?.duration_minutes || 30);

  const [customerId, setCustomerId] = useState(booking?.customer_id || null);
  const [customerLabel, setCustomerLabel] = useState(initialCustomer?.name || "");
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const [serviceId, setServiceId] = useState(booking?.service_id || services[0]?.id || "");
  const [staffId, setStaffId] = useState(booking?.staff_id || "");
  const [membershipId, setMembershipId] = useState(booking?.membership_id || "");
  const [date, setDate] = useState(toDateValue(start));
  const [time, setTime] = useState(toTimeValue(start));
  const [duration, setDuration] = useState(initialDuration);
  const [notes, setNotes] = useState(booking?.notes || "");
  const [status, setStatus] = useState(booking?.status || "confirmed");
  const [amount, setAmount] = useState(initialService?.price ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const matches = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => `${c.name} ${c.phone || ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [customers, customerSearch]);

  // A membership stays selectable while this booking already points to it,
  // even if it has since become unusable (expired/exhausted) — otherwise it
  // would silently vanish from the dropdown while editing.
  const usableMemberships = useMemo(() => {
    return (memberships || []).filter((m) =>
      m.customer_id === customerId
      && (m.id === membershipId || (m.status === "active" && !m.is_expired && !m.is_completed))
    );
  }, [memberships, customerId, membershipId]);

  function selectMembership(id) {
    setMembershipId(id);
    if (id) setAmount(0);
  }

  function selectService(id) {
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    if (svc) {
      setDuration(svc.duration_minutes);
      setAmount(svc.price ?? "");
    }
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
      if (!finalCustomerId) throw new Error(t("bookings.modal.errors.customerRequired"));

      const startAt = combine(date, time);
      const endAt = new Date(startAt.getTime() + Number(duration) * 60000);
      const payload = {
        business_id: business.id,
        customer_id: finalCustomerId,
        service_id: serviceId || null,
        staff_id: staffId || null,
        membership_id: membershipId || null,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        notes: notes || null,
        status,
      };

      if (isEdit) {
        const { error } = await supabase.from("bookings").update(payload).eq("id", booking.id).eq("business_id", business.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bookings").insert(payload);
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err.code === "23P01" || /exclusion/i.test(err.message || "")) {
        setError(t("bookings.modal.errors.overlap"));
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function setStatusOnly(nextStatus) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("bookings").update({ status: nextStatus }).eq("id", booking.id).eq("business_id", business.id);
    setBusy(false);
    if (error) { setError(error.message); return; }
    onSaved();
    onClose();
  }

  async function complete() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("complete_booking", {
      p_booking_id: booking.id,
      p_amount: amount === "" ? 0 : Number(amount),
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onSaved();
    onClose();
  }

  const customer = customers.find((c) => c.id === customerId);

  return (
    <Modal title={isEdit ? t("bookings.modal.editTitle") : t("bookings.modal.newTitle")} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Customer */}
        <Field label={t("bookings.modal.customerLabel")}>
          {addingCustomer ? (
            <div className="flex flex-col gap-2 rounded-lg p-2" style={{ border: `1px solid ${C.border}` }}>
              <TextInput required placeholder={t("bookings.modal.newCustomerName")} value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} disabled={locked} />
              <TextInput placeholder={t("bookings.modal.newCustomerPhone")} value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} disabled={locked} />
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
                    disabled={locked}
                  />
                </div>
                <Btn type="button" variant="secondary" icon={UserPlus} onClick={() => { setAddingCustomer(true); setPickerOpen(false); }} disabled={locked}>
                  {t("bookings.modal.newCustomer")}
                </Btn>
              </div>
              {pickerOpen && !locked && (
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

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("bookings.modal.serviceLabel")}>
            <Select
              disabled={locked}
              value={serviceId}
              onChange={(e) => selectService(e.target.value)}
              options={[{ value: "", label: t("bookings.modal.noService") }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </Field>
          <Field label={t("bookings.modal.staffLabel")}>
            <Select
              disabled={locked}
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              options={[{ value: "", label: t("bookings.modal.unassigned") }, ...staffList.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </Field>
        </div>

        {customerId && usableMemberships.length > 0 && (
          <Field label={t("bookings.modal.membershipLabel")}>
            <Select
              disabled={locked}
              value={membershipId}
              onChange={(e) => selectMembership(e.target.value)}
              options={[
                { value: "", label: t("bookings.modal.noMembership") },
                ...usableMemberships.map((m) => ({
                  value: m.id,
                  label: m.sessions_remaining != null
                    ? t("bookings.modal.membershipOptionSessions", { plan: m.plan_name, count: m.sessions_remaining })
                    : t("bookings.modal.membershipOptionUnlimited", { plan: m.plan_name }),
                })),
              ]}
            />
          </Field>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label={t("bookings.modal.dateLabel")}>
            <TextInput type="date" required disabled={locked} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("bookings.modal.timeLabel")}>
            <TextInput type="time" required disabled={locked} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label={t("bookings.modal.durationLabel")}>
            <TextInput type="number" min="5" step="5" required disabled={locked} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </div>

        <Field label={t("bookings.modal.notesLabel")}>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} disabled={locked} />
        </Field>

        {isEdit && (
          <Field label={t("bookings.modal.statusLabel")}>
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{t(`bookings.status.${booking.status}`)}</Pill>
              {!locked && (
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={STATUS_KEYS.map((k) => ({ value: k, label: t(`bookings.status.${k}`) }))}
                  className="w-44"
                />
              )}
            </div>
          </Field>
        )}

        {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}

        {isEdit && !locked && (
          <div className="rounded-xl p-3" style={{ backgroundColor: C.bg }}>
            <p className="mb-2 text-xs font-semibold" style={{ color: C.slate }}>{t("bookings.modal.completeSection")}</p>
            {membershipId && <p className="mb-2 text-xs" style={{ color: C.teal }}>{t("bookings.modal.completeUsesSession")}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <TextInput type="number" step="0.01" min="0" className="w-32" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("bookings.modal.amountLabel")} />
              <Btn type="button" variant="primary" disabled={busy} onClick={complete}>{t("bookings.modal.markCompleted")}</Btn>
              <Btn type="button" variant="secondary" disabled={busy} onClick={() => setStatusOnly("no_show")}>{t("bookings.status.no_show")}</Btn>
              <Btn type="button" variant="danger" disabled={busy} onClick={() => setStatusOnly("cancelled")}>{t("bookings.modal.cancelBooking")}</Btn>
              {customer?.phone && (
                <Btn type="button" variant="ghost" icon={MessageCircle} onClick={() => openWhatsApp(customer.phone, notes || "")}>
                  {t("common.openWhatsApp")}
                </Btn>
              )}
            </div>
          </div>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Btn variant="secondary" type="button" onClick={onClose}>{t("common.cancel")}</Btn>
          {!locked && <Btn type="submit" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Btn>}
        </div>
      </form>
    </Modal>
  );
}
