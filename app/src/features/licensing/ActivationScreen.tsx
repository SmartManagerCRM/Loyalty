import { useState } from "react";
import { KeyRound, Copy, Share2, FileUp, WifiOff, ShieldCheck } from "lucide-react";
import { useApp } from "../../app/AppContext";
import { Banner, Button, Card, TextArea, TextField } from "../../components/ui";
import { copyText, pickTextFile, saveAndShare } from "../../services/files";
import { LANGUAGES } from "../../i18n";
import { LogoFull } from "../../components/Logo";
import { DomainError } from "../../database/db";
import type { Language } from "../../domain/settings";

export function ActivationScreen() {
  const { license, licenseStatus, settings, svc, reloadSettings, t, toast, fail } = useApp();
  const [ref, setRef] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = license.buildActivationRequest(ref.trim() || undefined);

  const setLang = async (language: Language) => {
    await svc.settings.setUnguarded("locale", { ...settings.locale, language });
    await reloadSettings();
  };
  const activate = async (text: string) => {
    setBusy(true);
    setError(null);
    try {
      await license.importLicense(text);
      toast(t("activation.success"));
    } catch (e) {
      if (e instanceof DomainError) setError(t(`err.${e.code}`));
      else fail(e);
    } finally {
      setBusy(false);
    }
  };
  const chooseFile = async () => {
    try {
      const f = await pickTextFile("*/*");
      if (f) await activate(f.text);
    } catch (e) { fail(e); }
  };

  return (
    <div className="app">
      <main className="content no-nav">
        <div className="stack-lg">
          <div className="row between wrap">
            <div className="row"><KeyRound color="var(--brand)" /><strong>SmartManager Loyalty</strong></div>
            <div className="row wrap" role="group" aria-label={t("settings.language")}>
              {LANGUAGES.map((l) => (
                <button key={l.code} type="button" className={`chip ${settings.locale.language === l.code ? "on" : ""}`} onClick={() => void setLang(l.code)}>{l.label}</button>
              ))}
            </div>
          </div>

          <LogoFull />
          <div className="hero">
            <h2 style={{ fontSize: "1.4rem" }}>{t("activation.title")}</h2>
            <p className="muted" style={{ marginTop: 6 }}>{t("activation.intro")}</p>
            <div className="row" style={{ marginTop: 10 }}><WifiOff size={16} /><span className="small">{t("activation.offline")}</span></div>
          </div>

          {licenseStatus.kind === "invalid" ? (
            <Banner tone="danger">
              <strong>{t("activation.invalidTitle")}</strong>
              <div className="small">{t(`err.license_${licenseStatus.failure ?? "malformed"}`)}</div>
              {licenseStatus.failure === "wrong_device" ? <div className="small" style={{ marginTop: 4 }}>{t("activation.reissueHint")}</div> : null}
            </Banner>
          ) : null}

          <Card>
            <div className="stack">
              <h3>{t("activation.step1")}</h3>
              <p className="muted small">{t("activation.step1Text")}</p>
              <div>
                <div className="label small muted">{t("activation.deviceCode")}</div>
                <div className="mono strong ltr" style={{ fontSize: "1.25rem", letterSpacing: ".04em" }} data-testid="device-code">{license.fingerprint}</div>
              </div>
              <TextField label={t("activation.reference")} hint={t("activation.referenceHint")} value={ref} maxLength={120} onChange={(e) => setRef(e.target.value)} />
              <div className="row wrap">
                <Button variant="primary" onClick={() => void saveAndShare(req.filename, req.fileText, "application/json").catch(fail)}><Share2 />{t("activation.shareRequest")}</Button>
                <Button onClick={async () => toast((await copyText(req.compactText)) ? t("common.copied") : t("common.copyFailed"))}><Copy />{t("activation.copyRequest")}</Button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="stack">
              <h3>{t("activation.step2")}</h3>
              <p className="muted small">{t("activation.step2Text")}</p>
              <Button variant="primary" busy={busy} onClick={() => void chooseFile()}><FileUp />{t("activation.chooseFile")}</Button>
              <TextArea label={t("activation.pasteLabel")} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="SMLYLIC1:…" dir="ltr" />
              <Button busy={busy} disabled={!paste.trim()} onClick={() => void activate(paste)}>{t("activation.activate")}</Button>
              {error ? <p className="err" role="alert">{error}</p> : null}
            </div>
          </Card>

          <div className="row small muted"><ShieldCheck size={16} /><span>{t("activation.privacy")}</span></div>
        </div>
      </main>
    </div>
  );
}
