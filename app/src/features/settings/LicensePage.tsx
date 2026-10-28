import { useState } from "react";
import { Copy, FileUp, KeyRound, Share2 } from "lucide-react";
import { useApp } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Banner, Button, Card, TextArea, TextField } from "../../components/ui";
import { copyText, pickTextFile, saveAndShare } from "../../services/files";
import { DomainError } from "../../database/db";
import { MAX_CLOCK_REVIEWS } from "../../services/licensing";

export function LicensePage() {
  const { license, licenseStatus: s, t, date, toast, fail, num } = useApp();
  const [ref, setRef] = useState("");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const req = license.buildActivationRequest(ref.trim() || s.payload?.customerReference || undefined);
  const p = s.payload;

  const activate = async (text: string) => {
    setBusy(true); setError(null);
    try { await license.importLicense(text); toast(t("activation.success")); setPaste(""); }
    catch (e) { if (e instanceof DomainError) setError(t(`err.${e.code}`)); else fail(e); }
    finally { setBusy(false); }
  };

  return (
    <Page title={t("more.license")} back>
      <div className="stack-lg">
        <Banner tone={s.kind === "active" ? "ok" : s.kind === "expired" ? "danger" : "warn"}>
          <strong>{t(`license.status.${s.kind}`)}</strong>
          <div className="small">{t(`license.explain.${s.kind}`)}</div>
        </Banner>
        {p ? (
          <Card>
            <div className="kv"><span className="muted">{t("license.type")}</span><strong>{t(`license.type.${p.licenseType}`)}</strong></div>
            <div className="kv"><span className="muted">{t("license.reference")}</span><strong>{p.customerReference || "—"}</strong></div>
            <div className="kv"><span className="muted">{t("license.validFrom")}</span><strong>{date(p.validFrom.slice(0, 10))}</strong></div>
            <div className="kv"><span className="muted">{t("license.validUntil")}</span><strong>{p.expiresAt ? date(p.expiresAt, true) : t("license.noExpiry")}</strong></div>
            {s.validity?.daysRemaining != null && s.kind === "active" ? <div className="kv"><span className="muted">{t("license.daysLeft")}</span><strong className="num">{num(Math.max(0, s.validity.daysRemaining))}</strong></div> : null}
            <div className="kv"><span className="muted">{t("license.id")}</span><span className="mono small ltr">{p.licenseId}</span></div>
            <div className="kv"><span className="muted">{t("license.features")}</span><strong>{p.features.join(", ")}</strong></div>
          </Card>
        ) : null}
        {s.kind === "clock_anomaly" ? (
          <Banner tone="warn" action={<Button sm onClick={async () => { try { await license.reviewClock(); toast(t("common.done")); } catch (e) { fail(e); } }} disabled={s.clockReviewsLeft <= 0}>{t("license.confirmClock")}</Button>}>
            {t("license.clockHelp", { left: s.clockReviewsLeft, max: MAX_CLOCK_REVIEWS })}
          </Banner>
        ) : null}
        <Banner>{t("license.dataSafe")}</Banner>

        <Card><div className="stack">
          <h3><KeyRound size={18} style={{ verticalAlign: "-3px" }} /> {t("license.renew")}</h3>
          <p className="muted small">{t("license.renewText")}</p>
          <div><div className="small muted">{t("activation.deviceCode")}</div><div className="mono strong ltr" data-testid="device-code">{license.fingerprint}</div></div>
          <TextField label={t("activation.reference")} value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} />
          <div className="row wrap">
            <Button onClick={() => void saveAndShare(req.filename, req.fileText, "application/json").catch(fail)}><Share2 />{t("activation.shareRequest")}</Button>
            <Button onClick={async () => toast((await copyText(req.compactText)) ? t("common.copied") : t("common.copyFailed"))}><Copy />{t("activation.copyRequest")}</Button>
          </div>
          <Button variant="primary" busy={busy} onClick={async () => { try { const f = await pickTextFile("*/*"); if (f) await activate(f.text); } catch (e) { fail(e); } }}><FileUp />{t("activation.chooseFile")}</Button>
          <TextArea label={t("activation.pasteLabel")} value={paste} onChange={(e) => setPaste(e.target.value)} dir="ltr" placeholder="SMLYLIC1:…" />
          <Button busy={busy} disabled={!paste.trim()} onClick={() => void activate(paste)}>{t("activation.activate")}</Button>
          {error ? <p className="err" role="alert">{error}</p> : null}
        </div></Card>
        <p className="small muted">{t("license.deviceNote")}</p>
      </div>
    </Page>
  );
}
