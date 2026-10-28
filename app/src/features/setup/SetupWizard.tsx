import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ImagePlus, HardDrive, Upload, ArrowRight } from "lucide-react";
import { useApp } from "../../app/AppContext";
import { Banner, Button, Card, Chips, SelectField, TextField } from "../../components/ui";
import { CURRENCIES, minorToDecimalString, parseMoney } from "../../domain/money";
import { BUSINESS_TYPES, DateFormat, Language } from "../../domain/settings";
import { LANGUAGES } from "../../i18n";

async function toLogo(file: File): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file);
    const size = 160;
    const c = document.createElement("canvas");
    const r = Math.min(1, size / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * r);
    c.height = Math.round(bmp.height * r);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function SetupWizard() {
  const { svc, settings, reloadSettings, t, fail, toast } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [lang, setLang] = useState<Language>(settings.locale.language);
  const [currency, setCurrency] = useState(settings.currency.code);
  const [dateFormat, setDateFormat] = useState<DateFormat>(settings.locale.dateFormat);
  const [cc, setCc] = useState("");
  const dec = CURRENCIES.find((c) => c.code === currency)?.decimals ?? 2;
  const [spend, setSpend] = useState(minorToDecimalString(1000, 2));
  const [points, setPoints] = useState("1");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const finish = async (goImport: boolean) => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("err.name_required");
    const perAmountMinor = parseMoney(spend, dec);
    if (!perAmountMinor || perAmountMinor <= 0) e.spend = t("err.invalid_number");
    const pts = Number(points);
    if (!Number.isInteger(pts) || pts < 1) e.points = t("err.invalid_number");
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await svc.completeSetup({
        business: { name: name.trim(), type, phone: "", logoDataUrl: logo, countryCallingCode: cc.replace(/\D/g, "") },
        locale: { language: lang, dateFormat },
        currency: { code: currency, decimals: dec },
        earnRule: { perAmountMinor: perAmountMinor!, points: pts, perVisitBonus: 0, minPurchaseMinor: 0 },
      });
      await reloadSettings();
      toast(t("setup.done"));
      nav(goImport ? "/customers/import" : "/today", { replace: true });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app" dir={LANGUAGES.find((l) => l.code === lang)?.dir}>
      <main className="content no-nav">
        <div className="stack-lg">
          <div className="hero"><h2 style={{ fontSize: "1.4rem" }}>{t("setup.title")}</h2><p className="muted" style={{ marginTop: 6 }}>{t("setup.intro")}</p></div>

          <Card>
            <div className="stack">
              <TextField label={t("setup.businessName")} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="organization" maxLength={80} />
              <div className="field">
                <span className="label">{t("setup.logo")} <span className="muted">({t("common.optional")})</span></span>
                <div className="row">
                  {logo ? <img src={logo} alt="" width={48} height={48} style={{ borderRadius: 10, objectFit: "contain" }} /> : null}
                  <Button sm onClick={() => fileRef.current?.click()}><ImagePlus />{t("setup.chooseLogo")}</Button>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setLogo(await toLogo(f)); }} />
                </div>
              </div>
              <div className="field">
                <span className="label">{t("setup.businessType")} <span className="muted">({t("common.optional")})</span></span>
                <Chips value={type as string} onChange={setType} options={[{ value: "", label: t("common.none") }, ...BUSINESS_TYPES.map((b) => ({ value: b as string, label: t(`bizType.${b}`) }))]} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="stack">
              <div className="grid2">
                <SelectField label={t("settings.language")} value={lang} onChange={(e) => setLang(e.target.value as Language)}>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </SelectField>
                <SelectField label={t("settings.currency")} value={currency} onChange={(e) => { setCurrency(e.target.value); setSpend(minorToDecimalString(1000, CURRENCIES.find((c) => c.code === e.target.value)?.decimals ?? 2)); }}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </SelectField>
              </div>
              <div className="grid2">
                <SelectField label={t("settings.dateFormat")} value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                  <option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option><option value="YMD">YYYY-MM-DD</option>
                </SelectField>
                <TextField label={t("settings.countryCode")} hint={t("settings.countryCodeHint")} inputMode="numeric" placeholder="966" value={cc} onChange={(e) => setCc(e.target.value)} dir="ltr" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="stack">
              <h3>{t("setup.pointsRule")}</h3>
              <p className="muted small">{t("setup.pointsRuleText")}</p>
              <div className="grid2">
                <TextField label={t("setup.spendAmount", { currency })} inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} error={errors.spend} dir="ltr" />
                <TextField label={t("setup.pointsEarned")} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} error={errors.points} dir="ltr" />
              </div>
              <p className="hint">{t("setup.changeLater")}</p>
            </div>
          </Card>

          <Banner tone="warn">
            <div className="row"><HardDrive size={18} /><strong>{t("setup.storageTitle")}</strong></div>
            <div className="small">{t("setup.storageText")}</div>
          </Banner>

          <div className="stack">
            <Button variant="primary" block busy={busy} onClick={() => void finish(true)}><Upload />{t("setup.importCsv")}</Button>
            <Button block busy={busy} onClick={() => void finish(false)}>{t("setup.startEmpty")}<ArrowRight className="flip" /></Button>
          </div>
        </div>
      </main>
    </div>
  );
}
