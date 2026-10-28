import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Banner, Button, Card, Chips, SelectField, TextField } from "../../components/ui";
import { BUSINESS_TYPES, DateFormat, Language } from "../../domain/settings";
import { CURRENCIES } from "../../domain/money";
import { LANGUAGES } from "../../i18n";
import { sanitizeText } from "../../domain/phone";

export function SettingsPage() {
  const { svc, settings, t, reloadSettings, toast, fail } = useApp();
  const [name, setName] = useState(settings.business.name);
  const [phone, setPhone] = useState(settings.business.phone);
  const [type, setType] = useState(settings.business.type);
  const [cc, setCc] = useState(settings.business.countryCallingCode);
  const [days, setDays] = useState(String(settings.backupReminderDays));
  const [fieldLabel, setFieldLabel] = useState("");
  const [outcome, setOutcome] = useState("");
  const { data: hasTx } = useData(async () => Number((await svc.ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM transactions"))!.n) > 0, []);
  const save = async (fn: () => Promise<void>) => { try { await fn(); await reloadSettings(); toast(t("common.saved")); } catch (e) { fail(e); } };
  const decNow = settings.currency.decimals;

  return (
    <Page title={t("more.settings")} back>
      <div className="stack-lg">
        <Card><div className="stack">
          <h3>{t("settings.business")}</h3>
          <TextField label={t("setup.businessName")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <TextField label={t("settings.businessPhone")} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" maxLength={40} />
          <div className="field"><span className="label">{t("setup.businessType")}</span>
            <Chips value={type} onChange={setType} options={[{ value: "", label: t("common.none") }, ...BUSINESS_TYPES.map((b) => ({ value: b as string, label: t(`bizType.${b}`) }))]} /></div>
          <TextField label={t("settings.countryCode")} hint={t("settings.countryCodeHint")} inputMode="numeric" value={cc} onChange={(e) => setCc(e.target.value.replace(/\D/g, ""))} dir="ltr" />
          <Button variant="primary" write disabled={!name.trim()} onClick={() => void save(() => svc.settings.set("business", { ...settings.business, name: sanitizeText(name, 80), phone: phone.trim(), type, countryCallingCode: cc }))}>{t("common.save")}</Button>
        </div></Card>

        <Card><div className="stack">
          <h3>{t("settings.regional")}</h3>
          <SelectField label={t("settings.language")} value={settings.locale.language} onChange={(e) => void save(() => svc.settings.setUnguarded("locale", { ...settings.locale, language: e.target.value as Language }))}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </SelectField>
          <SelectField label={t("settings.dateFormat")} value={settings.locale.dateFormat} onChange={(e) => void save(() => svc.settings.setUnguarded("locale", { ...settings.locale, dateFormat: e.target.value as DateFormat }))}>
            <option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option><option value="YMD">YYYY-MM-DD</option>
          </SelectField>
          <SelectField label={t("settings.currency")} hint={hasTx ? t("settings.currencyLocked") : undefined} value={settings.currency.code} onChange={(e) => { const c = CURRENCIES.find((x) => x.code === e.target.value)!; void save(() => svc.settings.set("currency", c)); }}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code} disabled={!!hasTx && c.decimals !== decNow}>{c.code}</option>)}
          </SelectField>
        </div></Card>

        <Card><div className="stack">
          <h3>{t("settings.customFields")}</h3><p className="muted small">{t("settings.customFieldsHint")}</p>
          <div className="row wrap">{settings.customFields.map((f) => <Badge key={f.key} tone="info">{f.label}<button type="button" aria-label={t("common.remove")} className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => void save(() => svc.settings.set("customFields", settings.customFields.filter((x) => x.key !== f.key)))}><X size={14} /></button></Badge>)}</div>
          {settings.customFields.length < 5 ? <div className="row"><div className="grow"><TextField label={t("settings.fieldName")} value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} maxLength={40} /></div>
            <Button write disabled={!fieldLabel.trim()} onClick={() => { const label = sanitizeText(fieldLabel, 40); void save(async () => { await svc.settings.set("customFields", [...settings.customFields, { key: `f${Date.now().toString(36)}`, label }]); setFieldLabel(""); }); }}><Plus />{t("common.add")}</Button></div> : null}
        </div></Card>

        <Card><div className="stack">
          <h3>{t("settings.outcomes")}</h3><p className="muted small">{t("settings.outcomesHint")}</p>
          <div className="row wrap">{settings.customOutcomes.map((o) => <Badge key={o} tone="info">{o}<button type="button" aria-label={t("common.remove")} className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => void save(() => svc.settings.set("customOutcomes", settings.customOutcomes.filter((x) => x !== o)))}><X size={14} /></button></Badge>)}</div>
          <div className="row"><div className="grow"><TextField label={t("settings.outcomeName")} value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={40} /></div>
            <Button write disabled={!outcome.trim() || settings.customOutcomes.length >= 10} onClick={() => { const o = sanitizeText(outcome, 40).replace(/:/g, ""); void save(async () => { if (o && !settings.customOutcomes.includes(o)) await svc.settings.set("customOutcomes", [...settings.customOutcomes, o]); setOutcome(""); }); }}><Plus />{t("common.add")}</Button></div>
        </div></Card>

        <Card><div className="stack">
          <h3>{t("settings.backupReminder")}</h3>
          <TextField label={t("settings.reminderDays")} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} dir="ltr" />
          <Button write disabled={!days || Number(days) < 1} onClick={() => void save(() => svc.settings.set("backupReminderDays", Number(days)))}>{t("common.save")}</Button>
        </div></Card>
        <Banner>{t("settings.version", { version: __APP_VERSION__ })}</Banner>
      </div>
    </Page>
  );
}
