import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Field, TextInput } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";

// Each segment's rule_config shape — drives which numeric fields render for
// that card. Keep in sync with the defaults seeded by create_business() in
// supabase/schema.sql and the thresholds read in customer_segment_flags.
// Field labels/titles/descriptions live in settings.segmentation.fields.*
// in the locale files; this map only pins which config keys render.
const SEGMENT_FIELD_KEYS = {
  new: ["days"],
  active: ["days"],
  due: ["days_before"],
  inactive: ["days"],
  lost: ["days"],
  vip: ["min_spending", "min_visits"],
  high_value: ["min_lifetime_value"],
  frequent: ["min_visits_per_90d"],
  at_risk: ["overdue_ratio"],
};

const ORDER = ["new", "active", "due", "inactive", "lost", "vip", "high_value", "frequent", "at_risk"];

export default function SegmentationSettings() {
  const { t } = useTranslation();
  const { business } = useAuth();
  const [rules, setRules] = useState({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    supabase.from("segmentation_rules").select("*").eq("business_id", business.id).then(({ data }) => {
      const byKey = {};
      for (const row of data || []) byKey[row.segment_key] = row;
      setRules(byKey);
      setReady(true);
    });
  }, [business?.id]);

  function setField(segmentKey, field, value) {
    setSaved(false);
    setRules((prev) => ({
      ...prev,
      [segmentKey]: { ...prev[segmentKey], rule_config: { ...prev[segmentKey]?.rule_config, [field]: value === "" ? "" : Number(value) } },
    }));
  }

  async function handleSave() {
    setSaving(true);
    await Promise.all(
      Object.values(rules).map((r) => supabase.from("segmentation_rules").update({ rule_config: r.rule_config }).eq("id", r.id))
    );
    setSaving(false);
    setSaved(true);
  }

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("settings.segmentation.loading")}</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-xl text-sm" style={{ color: C.slateLight }}>
          {t("settings.segmentation.intro")}
        </p>
        <Btn icon={Save} onClick={handleSave} disabled={saving} className="shrink-0">{saving ? t("common.saving") : saved ? t("common.saved") : t("settings.segmentation.saveChanges")}</Btn>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {ORDER.filter((key) => rules[key]).map((key) => {
          const fieldKeys = SEGMENT_FIELD_KEYS[key];
          const rule = rules[key];
          return (
            <div key={key} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
              <div className="text-sm font-bold" style={{ color: C.ink }}>{t(`settings.segmentation.fields.${key}.title`)}</div>
              <div className="mt-0.5 text-xs" style={{ color: C.slateLight }}>{t(`settings.segmentation.fields.${key}.desc`)}</div>
              <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: fieldKeys.length > 1 ? "1fr 1fr" : "1fr" }}>
                {fieldKeys.map((field) => (
                  <Field key={field} label={t(`settings.segmentation.fields.${key}.${field}`)}>
                    <TextInput
                      type="number"
                      step="any"
                      value={rule.rule_config?.[field] ?? ""}
                      onChange={(e) => setField(key, field, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
