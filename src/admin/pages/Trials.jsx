import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { C } from "../../components/theme";
import { Btn, EmptyState } from "../../components/ui";
import { fetchBusinesses, updateBusiness } from "../../lib/adminApi";

function daysLeft(dateStr) {
  return Math.ceil((new Date(dateStr) - Date.now()) / 86400000);
}

export default function Trials() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);

  function load() {
    fetchBusinesses().then((r) => { setRows(r); setReady(true); });
  }
  useEffect(() => { load(); }, []);

  const trials = useMemo(() => {
    return rows
      .filter((r) => r.subscription_status === "trialing")
      .sort((a, b) => new Date(a.trial_ends_at) - new Date(b.trial_ends_at));
  }, [rows]);

  async function extend(businessId, currentEndsAt) {
    const base = currentEndsAt ? new Date(currentEndsAt) : new Date();
    base.setDate(base.getDate() + 14);
    await updateBusiness(businessId, { trialEndsAt: base.toISOString() });
    load();
  }

  async function convert(businessId) {
    await updateBusiness(businessId, { subscriptionPlan: "starter", subscriptionStatus: "active" });
    load();
  }

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("admin.common.loading")}</div>;

  return (
    <div className="p-8">
      <p className="text-sm" style={{ color: C.slateLight }}>{t("admin.trials.subtitle")}</p>

      {trials.length === 0 ? (
        <div className="mt-8"><EmptyState title={t("admin.trials.empty")} /></div>
      ) : (
        <div className="mt-5 space-y-3">
          {trials.map((b) => {
            const dl = daysLeft(b.trial_ends_at);
            return (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
                <div className="cursor-pointer" onClick={() => navigate(`/admin/businesses/${b.id}`)}>
                  <div className="text-sm font-bold" style={{ color: C.ink }}>{b.name}</div>
                  <div className="text-xs" style={{ color: C.slateLight }}>{b.owner_email}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold" style={{ color: dl <= 2 ? C.red : dl <= 5 ? C.amber : C.slate }}>
                    {dl <= 0 ? t("admin.trials.expired") : t("admin.trials.daysLeft", { count: dl })}
                  </span>
                  <Btn variant="secondary" onClick={() => extend(b.id, b.trial_ends_at)}>{t("admin.trials.extendTrial")}</Btn>
                  <Btn onClick={() => convert(b.id)}>{t("admin.trials.convertToPaid")}</Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
