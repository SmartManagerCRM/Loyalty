import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Select, Field, Pill } from "../../components/ui";
import { fetchBusiness, fetchBusinessMembers, updateBusiness } from "../../lib/adminApi";
import { formatMoney } from "../../lib/currencies";

const PLAN_KEYS = ["trial", "starter", "growth", "professional", "enterprise"];
const STATUS_KEYS = ["trialing", "active", "past_due", "canceled"];
const STATUS_COLOR = { trialing: C.amber, active: C.green, past_due: C.red, canceled: C.slateLight };

export default function BusinessDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [members, setMembers] = useState([]);
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState("trial");
  const [status, setStatus] = useState("trialing");
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const [b, m] = await Promise.all([fetchBusiness(id), fetchBusinessMembers(id)]);
    setBusiness(b);
    setMembers(m);
    if (b) {
      setPlan(b.subscription_plan);
      setStatus(b.subscription_status);
      setTrialEndsAt(b.trial_ends_at ? b.trial_ends_at.slice(0, 10) : "");
    }
    setReady(true);
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave() {
    setSaving(true);
    await updateBusiness(id, {
      subscriptionPlan: plan,
      subscriptionStatus: status,
      trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
    });
    setSaving(false);
    setSaved(true);
    load();
  }

  function extendTrial() {
    const base = trialEndsAt ? new Date(trialEndsAt) : new Date();
    base.setDate(base.getDate() + 14);
    setTrialEndsAt(base.toISOString().slice(0, 10));
    setSaved(false);
  }

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("admin.common.loading")}</div>;
  if (!business) return <div className="p-8 text-sm" style={{ color: C.red }}>{t("customers.profile.notFound")}</div>;

  return (
    <div className="p-8">
      <button onClick={() => navigate("/admin/businesses")} className="mb-4 flex items-center gap-1 text-xs font-semibold" style={{ color: C.slate }}>
        <ArrowLeft size={14} className="rtl:rotate-180" /> {t("admin.businesses.detail.back")}
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-start justify-between">
              <h1 className="text-lg font-bold" style={{ color: C.ink }}>{business.name}</h1>
              <Pill color={STATUS_COLOR[business.subscription_status]} bg={`${STATUS_COLOR[business.subscription_status]}1a`}>
                {t(`admin.common.statuses.${business.subscription_status}`)}
              </Pill>
            </div>
            <div className="mt-3 space-y-1.5 text-xs" style={{ color: C.slate }}>
              <div>{t("admin.businesses.detail.ownerLabel")}: {business.owner_email || "—"}</div>
              <div>{t("admin.businesses.detail.membersLabel")}: {business.member_count}</div>
              <div>{t("admin.businesses.detail.customersLabel")}: {business.total_customers}</div>
              <div>{t("admin.businesses.detail.totalRevenueLabel")}: {formatMoney(business.total_revenue_events, business.currency)}</div>
            </div>

            <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide" style={{ color: C.slateLight }}>{t("nav.team")}</h2>
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between text-xs" style={{ color: C.slate }}>
                  <span>{m.email}</span>
                  <span className="font-semibold" style={{ color: C.ink }}>{t(`roles.${m.role}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
            <h2 className="mb-4 text-sm font-bold" style={{ color: C.ink }}>{t("admin.subscriptions.title")}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("admin.businesses.detail.planLabel")}>
                <Select options={PLAN_KEYS.map((k) => ({ value: k, label: t(`settings.billing.plans.${k}`) }))} value={plan} onChange={(e) => { setPlan(e.target.value); setSaved(false); }} />
              </Field>
              <Field label={t("admin.businesses.detail.statusLabel")}>
                <Select options={STATUS_KEYS.map((k) => ({ value: k, label: t(`admin.common.statuses.${k}`) }))} value={status} onChange={(e) => { setStatus(e.target.value); setSaved(false); }} />
              </Field>
              <Field label={t("admin.businesses.detail.trialEndsLabel")}>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={trialEndsAt}
                    onChange={(e) => { setTrialEndsAt(e.target.value); setSaved(false); }}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: C.border }}
                  />
                </div>
              </Field>
              <div className="flex items-end">
                <Btn variant="secondary" onClick={extendTrial} className="w-full justify-center">{t("admin.businesses.detail.extendTrial")}</Btn>
              </div>
            </div>

            <Btn icon={Save} onClick={handleSave} disabled={saving} className="mt-5">
              {saving ? t("common.saving") : saved ? t("admin.businesses.detail.saved") : t("admin.businesses.detail.saveChanges")}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
