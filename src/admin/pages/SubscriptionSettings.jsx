import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { C } from "../../components/theme";
import { Btn, TextInput, Field } from "../../components/ui";
import { fetchSubscriptionSettings } from "../../lib/plans";
import { updateSubscriptionSettings } from "../../lib/adminApi";

export default function SubscriptionSettings() {
  const { t } = useTranslation();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetchSubscriptionSettings().then(setForm); }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateSubscriptionSettings(form.free_trial_enabled, Number(form.free_trial_days));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("admin.common.loading")}</div>;

  return (
    <div className="p-8 max-w-xl">
      <p className="text-sm" style={{ color: C.slateLight }}>{t("admin.subscriptionSettings.subtitle")}</p>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <label className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: C.ink }}>{t("admin.subscriptionSettings.freeTrialEnabled")}</span>
          <input
            type="checkbox"
            checked={form.free_trial_enabled}
            onChange={(e) => setForm((f) => ({ ...f, free_trial_enabled: e.target.checked }))}
          />
        </label>

        <div className="mt-4">
          <Field label={t("admin.subscriptionSettings.freeTrialDays")}>
            <TextInput
              type="number" min={0} value={form.free_trial_days}
              disabled={!form.free_trial_enabled}
              onChange={(e) => setForm((f) => ({ ...f, free_trial_days: e.target.value }))}
            />
          </Field>
          <p className="mt-1.5 text-xs" style={{ color: C.slateLight }}>{t("admin.subscriptionSettings.freeTrialDaysHint")}</p>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Btn onClick={handleSave} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Btn>
          {saved && <span className="text-xs font-semibold" style={{ color: C.green }}>{t("admin.subscriptionSettings.saved")}</span>}
        </div>
      </div>
    </div>
  );
}
