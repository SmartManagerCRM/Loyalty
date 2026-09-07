import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, Copy, Plus, Phone, Mail, Calendar } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Pill, TextInput, TextArea, Field, Modal } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { primarySegment, nextBestAction, churnRiskScore } from "../../lib/segmentation";
import { generateMessage } from "../../lib/messageTemplates";
import { openWhatsApp } from "../../lib/whatsapp";

function LogVisitModal({ businessId, customerId, onClose, onSaved }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    await supabase.from("customer_visits").insert({
      business_id: businessId, customer_id: customerId, visit_date: date, amount: Number(amount) || 0, service, source: "manual",
    });
    setBusy(false);
    onSaved();
    onClose();
  }

  return (
    <Modal title="Log a visit" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Date"><TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Amount"><TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Service"><TextInput value={service} onChange={(e) => setService(e.target.value)} /></Field>
        <div className="mt-2 flex justify-end gap-2">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const [customer, setCustomer] = useState(null);
  const [flags, setFlags] = useState(null);
  const [visits, setVisits] = useState([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [showLogVisit, setShowLogVisit] = useState(false);

  async function loadAll() {
    const [{ data: customerRow }, { data: overviewRow }, { data: visitRows }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase.from("customer_overview").select("*").eq("customer_id", id).single(),
      supabase.from("customer_visits").select("*").eq("customer_id", id).order("visit_date", { ascending: false }),
    ]);
    setCustomer(customerRow);
    setFlags(overviewRow);
    setVisits(visitRows || []);
    setReady(true);
  }

  useEffect(() => { loadAll(); }, [id]);

  useEffect(() => {
    if (!flags || !customer) return;
    const nba = nextBestAction(flags, { visitLabel: business?.visit_label });
    setMessage(generateMessage({
      action: nba?.action, customerName: customer.name, businessName: business?.name,
      days: flags.days_since_last_visit, language: business?.default_language,
    }));
  }, [flags, customer, business]);

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>Loading…</div>;
  if (!customer) return <div className="p-8 text-sm" style={{ color: C.red }}>Customer not found.</div>;

  const seg = flags ? primarySegment(flags) : null;
  const nba = flags ? nextBestAction(flags, { visitLabel: business?.visit_label }) : null;
  const risk = flags ? churnRiskScore(flags) : null;

  return (
    <div className="p-8">
      <button onClick={() => navigate("/customers")} className="mb-4 flex items-center gap-1 text-xs font-semibold" style={{ color: C.slate }}>
        <ArrowLeft size={14} /> Back to Customers
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-start justify-between">
              <h1 className="text-lg font-bold" style={{ color: C.ink }}>{customer.name}</h1>
              {seg && <Pill color={seg.color} bg={`${seg.color}1a`}>{seg.label}</Pill>}
            </div>
            <div className="mt-3 space-y-1.5 text-xs" style={{ color: C.slate }}>
              {customer.phone && <div className="flex items-center gap-1.5"><Phone size={13} />{customer.phone}</div>}
              {customer.email && <div className="flex items-center gap-1.5"><Mail size={13} />{customer.email}</div>}
              <div className="flex items-center gap-1.5"><Calendar size={13} />Customer since {customer.customer_since}</div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl p-2.5" style={{ backgroundColor: C.bg }}>
                <div className="text-lg font-bold" style={{ color: C.ink }}>{flags?.total_visits ?? 0}</div>
                <div className="text-[10px]" style={{ color: C.slateLight }}>Total Visits</div>
              </div>
              <div className="rounded-xl p-2.5" style={{ backgroundColor: C.bg }}>
                <div className="text-lg font-bold" style={{ color: C.ink }}>{business?.currency} {Number(flags?.total_spending || 0).toLocaleString()}</div>
                <div className="text-[10px]" style={{ color: C.slateLight }}>Total Spending</div>
              </div>
              <div className="rounded-xl p-2.5" style={{ backgroundColor: C.bg }}>
                <div className="text-lg font-bold" style={{ color: C.ink }}>{flags?.days_since_last_visit ?? "—"}</div>
                <div className="text-[10px]" style={{ color: C.slateLight }}>Days Since Last Visit</div>
              </div>
              <div className="rounded-xl p-2.5" style={{ backgroundColor: C.bg }}>
                <div className="text-lg font-bold" style={{ color: C.ink }}>{flags?.avg_return_cycle_days ? Math.round(flags.avg_return_cycle_days) : "—"}</div>
                <div className="text-[10px]" style={{ color: C.slateLight }}>Avg Return Cycle (days)</div>
              </div>
            </div>

            <Btn className="mt-4 w-full justify-center" variant="secondary" icon={Plus} onClick={() => setShowLogVisit(true)}>
              Log {business?.visit_label || "Visit"}
            </Btn>
          </div>

          <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.slateLight }}>Timeline</h2>
            {visits.length === 0 ? (
              <p className="text-xs" style={{ color: C.slateLight }}>No visits logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {visits.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-xs" style={{ color: C.slate }}>
                    <span>{v.visit_date} {v.service && `· ${v.service}`}</span>
                    <span className="font-semibold" style={{ color: C.ink }}>{business?.currency} {Number(v.amount).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl p-5 shadow-sm" style={{ border: `1px solid ${C.border}`, backgroundColor: C.navy }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.greenTint }}>Next Best Action</div>
                <div className="mt-1 text-xl font-bold text-white">{nba?.action || "—"}</div>
              </div>
              {risk && (
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.greenTint }}>Churn Risk</div>
                  <div className="text-xl font-bold text-white">{risk.score}<span className="text-xs font-normal">/100</span></div>
                </div>
              )}
            </div>
            <p className="mt-2 text-sm" style={{ color: "#B9C6D6" }}>{nba?.reason}</p>
            {risk && (
              <div className="mt-3 space-y-1 border-t pt-3 text-xs" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                {risk.breakdown.map((b, i) => (
                  <div key={i} className="flex justify-between" style={{ color: "#B9C6D6" }}>
                    <span>{b.label}</span>
                    <span className="font-semibold text-white">+{b.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: C.ink }}>Suggested Message</h2>
            <TextArea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[120px]" />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Btn variant="secondary" icon={Copy} onClick={() => navigator.clipboard.writeText(message)}>Copy Message</Btn>
              <Btn icon={MessageCircle} disabled={!customer.phone} onClick={() => openWhatsApp(customer.phone, message)}>Open WhatsApp</Btn>
            </div>
            {!customer.phone && <p className="mt-2 text-xs" style={{ color: C.slateLight }}>Add a phone number to this customer to enable WhatsApp.</p>}
          </div>
        </div>
      </div>

      {showLogVisit && (
        <LogVisitModal businessId={business.id} customerId={customer.id} onClose={() => setShowLogVisit(false)} onSaved={loadAll} />
      )}
    </div>
  );
}
