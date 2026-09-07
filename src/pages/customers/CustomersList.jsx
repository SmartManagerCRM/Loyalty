import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Upload, Search } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Modal, Field, Select, Pill, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useCustomerOverview } from "../../lib/useCustomerOverview";
import { primarySegment } from "../../lib/segmentation";
import { supabase } from "../../lib/supabaseClient";
import { formatMoney } from "../../lib/currencies";
import ImportCustomers from "./ImportCustomers";

const SEGMENT_FILTERS = [
  { value: "all", label: "All segments" },
  { value: "new", label: "New" },
  { value: "active", label: "Active" },
  { value: "due", label: "Due" },
  { value: "inactive", label: "Inactive" },
  { value: "lost", label: "Lost" },
  { value: "vip", label: "VIP" },
  { value: "high_value", label: "High Value" },
  { value: "frequent", label: "Frequent" },
  { value: "at_risk", label: "At Risk" },
];

function AddCustomerModal({ businessId, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("customers").insert({
      business_id: businessId, name: name.trim(), phone: phone.trim() || null, email: email.trim() || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onAdded();
    onClose();
  }

  return (
    <Modal title="Add customer" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Name"><TextInput required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9665…" /></Field>
        <Field label="Email"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose} type="button">Cancel</Btn>
          <Btn type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function CustomersList() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const { rows, ready, refetch } = useCustomerOverview(business?.id);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (segment !== "all" && !r[`is_${segment}`]) return false;
      if (search && !`${r.name} ${r.phone || ""} ${r.email || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, segment]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: C.slateLight }}>{rows.length} total</p>
        <div className="flex gap-2">
          <Btn variant="secondary" icon={Upload} onClick={() => setShowImport(true)}>Import</Btn>
          <Btn icon={Plus} onClick={() => setShowAdd(true)}>Add customer</Btn>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.slateLight }} />
          <TextInput className="pl-9" placeholder="Search name, phone, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select options={SEGMENT_FILTERS} value={segment} onChange={(e) => setSegment(e.target.value)} className="w-48" />
      </div>

      {!ready ? (
        <p className="mt-8 text-sm" style={{ color: C.slateLight }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={rows.length === 0 ? "No customers yet" : "No customers match your filters"}
            subtitle={rows.length === 0 ? "Import a spreadsheet or add your first customer to get started." : undefined}
            action={rows.length === 0 && <Btn icon={Upload} onClick={() => setShowImport(true)}>Import customers</Btn>}
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Segment</th>
                <th className="px-4 py-3">Last {business?.visit_label || "Visit"}</th>
                <th className="px-4 py-3">Visits</th>
                <th className="px-4 py-3">Total Spending</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const seg = primarySegment(r);
                return (
                  <tr
                    key={r.customer_id}
                    className="cursor-pointer hover:bg-black/[0.02]"
                    style={{ borderBottom: `1px solid ${C.border}` }}
                    onClick={() => navigate(`/customers/${r.customer_id}`)}
                  >
                    <td className="px-4 py-3 font-semibold" style={{ color: C.ink }}>{r.name}</td>
                    <td className="px-4 py-3">{seg && <Pill color={seg.color} bg={`${seg.color}1a`}>{seg.label}</Pill>}</td>
                    <td className="px-4 py-3" style={{ color: C.slate }}>{r.days_since_last_visit != null ? `${r.days_since_last_visit} days ago` : "—"}</td>
                    <td className="px-4 py-3" style={{ color: C.slate }}>{r.total_visits}</td>
                    <td className="px-4 py-3" style={{ color: C.slate }}>{formatMoney(r.total_spending, business?.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddCustomerModal businessId={business.id} onClose={() => setShowAdd(false)} onAdded={refetch} />}
      {showImport && <ImportCustomers businessId={business.id} onClose={() => { setShowImport(false); refetch(); }} onImported={refetch} />}
    </div>
  );
}
