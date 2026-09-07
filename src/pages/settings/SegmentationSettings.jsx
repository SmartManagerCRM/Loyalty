import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Field, TextInput } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";

// Each segment's rule_config shape — drives which numeric fields render for
// that card. Keep in sync with the defaults seeded by create_business() in
// supabase/schema.sql and the thresholds read in customer_segment_flags.
const SEGMENT_FIELDS = {
  new:        { title: "New", desc: "Customer created within the last N days.", fields: [["days", "Days since joining"]] },
  active:     { title: "Active", desc: "Customer visited within N days.", fields: [["days", "Days since last visit"]] },
  due:        { title: "Due", desc: "Customer is approaching their expected return date.", fields: [["days_before", "Days before expected return to flag as Due"]] },
  inactive:   { title: "Inactive", desc: "Customer has exceeded their expected return period.", fields: [["days", "Days since last visit"]] },
  lost:       { title: "Lost", desc: "Customer has been inactive for longer than this.", fields: [["days", "Days since last visit"]] },
  vip:        { title: "VIP", desc: "Customer meets spending or visit thresholds.", fields: [["min_spending", "Minimum lifetime spending"], ["min_visits", "Minimum visits"]] },
  high_value: { title: "High Value", desc: "Customer lifetime value is above this threshold.", fields: [["min_lifetime_value", "Minimum lifetime value"]] },
  frequent:   { title: "Frequent", desc: "Customer visits more often than this, per 90 days.", fields: [["min_visits_per_90d", "Minimum visits per 90 days"]] },
  at_risk:    { title: "At Risk", desc: "Customer is this many times past their normal return cycle.", fields: [["overdue_ratio", "Overdue ratio (e.g. 1.3 = 30% late)"]] },
};

const ORDER = ["new", "active", "due", "inactive", "lost", "vip", "high_value", "frequent", "at_risk"];

export default function SegmentationSettings() {
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

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>Loading…</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-xl text-sm" style={{ color: C.slateLight }}>
          These transparent, editable thresholds decide who counts as New, Active, Due, Inactive, Lost, VIP, High Value, Frequent, or At Risk.
        </p>
        <Btn icon={Save} onClick={handleSave} disabled={saving} className="shrink-0">{saving ? "Saving…" : saved ? "Saved" : "Save changes"}</Btn>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {ORDER.filter((key) => rules[key]).map((key) => {
          const meta = SEGMENT_FIELDS[key];
          const rule = rules[key];
          return (
            <div key={key} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
              <div className="text-sm font-bold" style={{ color: C.ink }}>{meta.title}</div>
              <div className="mt-0.5 text-xs" style={{ color: C.slateLight }}>{meta.desc}</div>
              <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: meta.fields.length > 1 ? "1fr 1fr" : "1fr" }}>
                {meta.fields.map(([field, label]) => (
                  <Field key={field} label={label}>
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
