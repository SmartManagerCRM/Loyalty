import { useState } from "react";
import { DatabaseBackup, FileUp, Lock, Share2 } from "lucide-react";
import { useApp } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Banner, Button, Card, Check, ConfirmSheet, TextField } from "../../components/ui";
import { pickTextFile, saveAndShare } from "../../services/files";
import type { BackupFile, BackupInspection } from "../../repositories/backup";
import { localDate, dayDiff } from "../../domain/dates";

export function BackupPage() {
  const { svc, settings, t, date, num, bump, toast, fail, reloadSettings } = useApp();
  const [encrypt, setEncrypt] = useState(true);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<{ name: string; text: string } | null>(null);
  const [restorePass, setRestorePass] = useState("");
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [confirm, setConfirm] = useState<BackupFile | null>(null);
  const [typed, setTyped] = useState("");
  const [restored, setRestored] = useState(false);

  const last = settings.lastBackupAt;
  const lastDays = last ? dayDiff(localDate(last), localDate(new Date())) : null;
  const passOk = !encrypt || (pass.length >= 8 && pass === pass2);

  const create = async () => {
    setBusy(true);
    try {
      const out = await svc.backup.export(encrypt ? pass : undefined);
      await saveAndShare(out.filename, out.text, "application/json");
      await reloadSettings();
      toast(t("backup.created"));
      setPass(""); setPass2("");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const inspect = async (text: string, passphrase?: string) => {
    setBusy(true);
    try { setInspection(await svc.backup.inspect(text, passphrase)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const choose = async () => {
    try {
      const f = await pickTextFile("*/*");
      if (!f) return;
      setPicked(f); setRestorePass(""); setRestored(false); setInspection(null);
      await inspect(f.text);
    } catch (e) { fail(e); }
  };
  const doRestore = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await svc.backup.restore(confirm);
      await reloadSettings();
      bump(); setConfirm(null); setPicked(null); setInspection(null); setRestored(true); setTyped("");
    } catch (e) { fail(e); setConfirm(null); } finally { setBusy(false); }
  };

  const b = inspection?.backup;
  return (
    <Page title={t("more.backup")} back>
      <div className="stack-lg">
        <Banner tone={last ? (lastDays! >= settings.backupReminderDays ? "warn" : "ok") : "warn"}>
          {last ? t("backup.last", { date: date(last, true) }) : t("backup.never")}
        </Banner>
        <Banner>{t("backup.responsibility")}</Banner>

        <Card><div className="stack">
          <h3><DatabaseBackup size={18} style={{ verticalAlign: "-3px" }} /> {t("backup.create")}</h3>
          <Check label={<span><Lock size={14} /> {t("backup.protect")}</span>} checked={encrypt} onChange={setEncrypt} />
          {encrypt ? (
            <>
              <TextField label={t("backup.passphrase")} type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" error={pass && pass.length < 8 ? t("backup.passShort") : null} />
              <TextField label={t("backup.passphrase2")} type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" error={pass2 && pass !== pass2 ? t("backup.passMismatch") : null} />
              <Banner tone="warn">{t("backup.passWarning")}</Banner>
            </>
          ) : <Banner tone="warn">{t("backup.plainWarning")}</Banner>}
          <Button variant="primary" busy={busy} disabled={!passOk} onClick={() => void create()}><Share2 />{t("backup.createButton")}</Button>
          <p className="hint">{t("backup.shareHint")}</p>
        </div></Card>

        <Card><div className="stack">
          <h3><FileUp size={18} style={{ verticalAlign: "-3px" }} /> {t("backup.restore")}</h3>
          <p className="muted small">{t("backup.restoreIntro")}</p>
          <Button onClick={() => void choose()}>{t("backup.choose")}</Button>
          {restored ? <Banner tone="ok">{t("backup.restored")}</Banner> : null}
          {picked && inspection?.needsPassphrase ? (
            <div className="stack">
              <p className="small">{picked.name}</p>
              <TextField label={t("backup.passphrase")} type="password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} />
              {inspection.error === "wrong_passphrase_or_corrupt" ? <p className="err">{t("backup.err.wrong_passphrase_or_corrupt")}</p> : null}
              <Button variant="primary" busy={busy} disabled={!restorePass} onClick={() => void inspect(picked.text, restorePass)}>{t("backup.unlock")}</Button>
            </div>
          ) : null}
          {inspection && !inspection.needsPassphrase && inspection.error ? <Banner tone="danger">{t(`backup.err.${inspection.error}`)}</Banner> : null}
          {b ? (
            <div className="stack">
              <Banner tone="ok">{t("backup.valid")}</Banner>
              <div className="card"><div className="kv"><span className="muted">{t("backup.exportedAt")}</span><strong>{date(b.exportedAt, true)}</strong></div>
                <div className="kv"><span className="muted">{t("nav.customers")}</span><strong className="num">{num(b.counts.customers ?? 0)}</strong></div>
                <div className="kv"><span className="muted">{t("backup.transactions")}</span><strong className="num">{num(b.counts.transactions ?? 0)}</strong></div>
                <div className="kv"><span className="muted">{t("backup.ledger")}</span><strong className="num">{num(b.counts.points_ledger ?? 0)}</strong></div>
                <div className="kv"><span className="muted">{t("backup.version")}</span><strong>{b.appVersion} · schema {b.schemaVersion}</strong></div></div>
              <Button variant="danger" write={false} onClick={() => setConfirm(b)}>{t("backup.restoreNow")}</Button>
            </div>
          ) : null}
        </div></Card>
        <Banner>{t("backup.licenseNote")}</Banner>
      </div>
      {confirm ? (
        <ConfirmSheet title={t("backup.confirmTitle")} danger confirmLabel={t("backup.restoreNow")} disabled={busy || typed.trim().toUpperCase() !== "RESTORE"} onClose={() => setConfirm(null)} onConfirm={() => void doRestore()}>
          <p>{t("backup.confirmText", { customers: num(confirm.counts.customers ?? 0) })}</p>
          <TextField label={t("backup.typeRestore")} value={typed} onChange={(e) => setTyped(e.target.value)} dir="ltr" />
        </ConfirmSheet>
      ) : null}
    </Page>
  );
}
