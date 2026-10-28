import { useState } from "react";
import { useApp } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Banner, Button, Card, TextField } from "../../components/ui";
import { DEFAULT_SETTINGS, ScoringSettings } from "../../domain/settings";

const FIELDS: { key: keyof ScoringSettings; unit: "days" | "pct" | "count" }[] = [
  { key: "defaultIntervalDays", unit: "days" }, { key: "atRiskPct", unit: "pct" }, { key: "atRiskMinDays", unit: "days" },
  { key: "winBackPct", unit: "pct" }, { key: "winBackMinDays", unit: "days" }, { key: "newWindowDays", unit: "days" }, { key: "newGraceDays", unit: "days" },
  { key: "declineRatioPct", unit: "pct" }, { key: "declineMinPriorVisits", unit: "count" }, { key: "cooldownDays", unit: "days" },
  { key: "birthdayLeadDays", unit: "days" }, { key: "pointsReminderCooldownDays", unit: "days" },
];

export function RulesPage() {
  const { svc, settings, t, reloadSettings, toast, fail } = useApp();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map((f) => [f.key, String(settings.scoring[f.key])])));
  const num = (k: keyof ScoringSettings) => Number(vals[k]);
  const invalid: string | null =
    FIELDS.some((f) => !Number.isInteger(num(f.key)) || num(f.key) < 1) ? "err.invalid_number" :
    num("atRiskPct") < 100 ? "rules.err.atRiskPct" : num("winBackPct") <= num("atRiskPct") ? "rules.err.winBackPct" : num("declineRatioPct") >= 100 ? "rules.err.decline" : null;
  const example = Math.max(Math.round((20 * num("atRiskPct")) / 100), num("atRiskMinDays"));
  const exampleWin = Math.max(Math.round((20 * num("winBackPct")) / 100), num("winBackMinDays"));
  return (
    <Page title={t("more.rules")} back>
      <div className="stack-lg">
        <Banner>{t("rules.intro")}</Banner>
        <Card><div className="stack">
          {FIELDS.map((f) => <TextField key={f.key} label={t(`rules.${f.key}`)} hint={t(`rules.${f.key}.hint`)} inputMode="numeric" value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value.replace(/\D/g, "") })} dir="ltr" />)}
        </div></Card>
        {invalid ? <p className="err">{t(invalid)}</p> : <Banner tone="ok">{t("rules.example", { atRisk: example, winBack: exampleWin })}</Banner>}
        <div className="row">
          <Button write onClick={() => setVals(Object.fromEntries(FIELDS.map((f) => [f.key, String(DEFAULT_SETTINGS.scoring[f.key])])))}>{t("rules.reset")}</Button>
          <Button variant="primary" write className="grow" disabled={!!invalid} onClick={async () => {
            try { await svc.settings.set("scoring", Object.fromEntries(FIELDS.map((f) => [f.key, num(f.key)])) as unknown as ScoringSettings); await reloadSettings(); toast(t("common.saved")); } catch (e) { fail(e); }
          }}>{t("common.save")}</Button>
        </div>
      </div>
    </Page>
  );
}
