import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Upload, Search, ArrowUpCircle } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Modal, Field, Select, Pill, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useCustomerOverview } from "../../lib/useCustomerOverview";
import { primarySegment } from "../../lib/segmentation";
import { supabase } from "../../lib/supabaseClient";
import { formatMoney } from "../../lib/currencies";
import ImportCustomers from "./ImportCustomers";

const SEGMENT_KEYS = ["new", "active", "due", "inactive", "lost", "vip", "high_value", "frequent", "at_risk"];

function AddCustomerModal({ businessId, onClose, onAdded }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLimitReached(false);
    const { error } = await supabase.from("customers").insert({
      business_id: businessId, name: name.trim(), phone: phone.trim() || null, email: email.trim() || null,
    });
    setBusy(false);
    if (error) {
      // Raised by the enforce_customer_limit() DB trigger — the plan's
      // customer cap is enforced server-side, never trusted client-side.
      if (error.message?.includes("customer_limit_reached")) setLimitReached(true);
      else setError(error.message);
      return;
    }
    onAdded();
    onClose();
  }

  if (limitReached) {
    return (
      <Modal title={t("customers.addModal.title")} onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm font-semibold" style={{ color: C.ink }}>{t("customers.addModal.limitReachedTitle")}</p>
          <p className="text-xs" style={{ color: C.slateLight }}>{t("customers.addModal.limitReachedBody")}</p>
          <Btn icon={ArrowUpCircle} onClick={() => navigate("/settings?tab=billing")} className="mt-2">
            {t("upgradePrompt.cta")}
          </Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("customers.addModal.title")} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label={t("customers.addModal.nameLabel")}><TextInput required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("customers.addModal.phoneLabel")}><TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9665…" /></Field>
        <Field label={t("customers.addModal.emailLabel")}><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose} type="button">{t("common.cancel")}</Btn>
          <Btn type="submit" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function CustomersList() {
  const { t } = useTranslation();
  const SEGMENT_FILTERS = [{ value: "all", label: t("customers.list.allSegments") }, ...SEGMENT_KEYS.map((k) => ({ value: k, label: t(`segments.${k}`) }))];
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
        <p className="text-sm" style={{ color: C.slateLight }}>{t("customers.list.total", { count: rows.length })}</p>
        <div className="flex gap-2">
          <Btn variant="secondary" icon={Upload} onClick={() => setShowImport(true)}>{t("customers.list.import")}</Btn>
          <Btn icon={Plus} onClick={() => setShowAdd(true)}>{t("customers.list.addCustomer")}</Btn>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: C.slateLight }} />
          <TextInput className="ps-9" placeholder={t("customers.list.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select options={SEGMENT_FILTERS} value={segment} onChange={(e) => setSegment(e.target.value)} className="w-48" />
      </div>

      {!ready ? (
        <p className="mt-8 text-sm" style={{ color: C.slateLight }}>{t("customers.list.loading")}</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={rows.length === 0 ? t("customers.list.emptyTitle") : t("customers.list.emptyTitleFiltered")}
            subtitle={rows.length === 0 ? t("customers.list.emptySubtitle") : undefined}
            action={rows.length === 0 && <Btn icon={Upload} onClick={() => setShowImport(true)}>{t("customers.list.importCustomers")}</Btn>}
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
                <th className="px-4 py-3">{t("customers.list.columnName")}</th>
                <th className="px-4 py-3">{t("customers.list.columnSegment")}</th>
                <th className="px-4 py-3">{t("customers.list.columnLastVisit", { visitLabel: business?.visit_label || "Visit" })}</th>
                <th className="px-4 py-3">{t("customers.list.columnVisits")}</th>
                <th className="px-4 py-3">{t("customers.list.columnTotalSpending")}</th>
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
                    <td className="px-4 py-3" style={{ color: C.slate }}>{r.days_since_last_visit != null ? t("common.daysAgo", { count: r.days_since_last_visit }) : t("common.na")}</td>
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
