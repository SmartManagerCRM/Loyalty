import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, MessageCircle } from "lucide-react";
import { C } from "../../components/theme";
import { TextInput, Pill, IconButton } from "../../components/ui";
import { fetchBusinesses } from "../../lib/adminApi";
import { openWhatsApp } from "../../lib/whatsapp";

const STATUS_COLOR = { trialing: C.amber, active: C.green, past_due: C.red, canceled: C.slateLight };

export default function Businesses() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { fetchBusinesses().then((r) => { setRows(r); setReady(true); }); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.owner_email || "").toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="p-8">
      <p className="text-sm" style={{ color: C.slateLight }}>{t("admin.businesses.subtitle")}</p>

      <div className="mt-5 relative max-w-md">
        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: C.slateLight }} />
        <TextInput className="ps-9" placeholder={t("admin.businesses.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!ready ? (
        <p className="mt-8 text-sm" style={{ color: C.slateLight }}>{t("admin.common.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: C.slateLight }}>{t("admin.businesses.empty")}</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
                <th className="px-4 py-3">{t("admin.businesses.columnName")}</th>
                <th className="px-4 py-3">{t("admin.businesses.columnOwner")}</th>
                <th className="px-4 py-3">{t("admin.businesses.columnPlan")}</th>
                <th className="px-4 py-3">{t("admin.businesses.columnStatus")}</th>
                <th className="px-4 py-3">{t("admin.businesses.columnMembers")}</th>
                <th className="px-4 py-3">{t("admin.businesses.columnCustomers")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer hover:bg-black/[0.02]"
                  style={{ borderBottom: `1px solid ${C.border}` }}
                  onClick={() => navigate(`/admin/businesses/${b.id}`)}
                >
                  <td className="px-4 py-3 font-semibold" style={{ color: C.ink }}>{b.name}</td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{b.owner_email || "—"}</td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{t(`settings.billing.plans.${b.subscription_plan}`)}</td>
                  <td className="px-4 py-3"><Pill color={STATUS_COLOR[b.subscription_status]} bg={`${STATUS_COLOR[b.subscription_status]}1a`}>{t(`admin.common.statuses.${b.subscription_status}`)}</Pill></td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{b.member_count}</td>
                  <td className="px-4 py-3" style={{ color: C.slate }}>{b.total_customers}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      title={b.phone ? t("common.openWhatsApp") : t("common.noPhoneOnFile")}
                      disabled={!b.phone}
                      onClick={() => openWhatsApp(b.phone, t("admin.businesses.whatsappMessage", { businessName: b.name }))}
                    >
                      <MessageCircle size={15} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
