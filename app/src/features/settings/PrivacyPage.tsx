import { useState } from "react";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { useApp } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Banner, Button, Card, ConfirmSheet, TextField } from "../../components/ui";
import { saveAndShare } from "../../services/files";
import { Link } from "react-router-dom";

export function PrivacyPage() {
  const { svc, t, bump, reloadSettings, toast, fail } = useApp();
  const [del, setDel] = useState(false);
  const [typed, setTyped] = useState("");
  const exp = async (name: string, fn: () => Promise<string>) => { try { await saveAndShare(name, await fn(), "text/csv"); } catch (e) { fail(e); } };
  return (
    <Page title={t("more.privacy")} back>
      <div className="stack-lg">
        <Banner tone="ok"><div className="row"><ShieldCheck size={18} /><strong>{t("privacy.title")}</strong></div></Banner>
        <Card><ul className="stack small" style={{ margin: 0, paddingInlineStart: 18 }}>
          {["local", "noTracking", "noContacts", "permissions", "messages", "backups", "dnc"].map((k) => <li key={k}>{t(`privacy.${k}`)}</li>)}
        </ul></Card>

        <Card><div className="stack">
          <h3>{t("privacy.export")}</h3>
          <Button onClick={() => void exp("customers.csv", () => svc.io.exportCustomers())}><Download />{t("privacy.exportCustomers")}</Button>
          <Button onClick={() => void exp("transactions.csv", () => svc.io.exportTransactions())}><Download />{t("privacy.exportTransactions")}</Button>
          <Button onClick={() => void exp("points-ledger.csv", () => svc.io.exportLedger())}><Download />{t("privacy.exportLedger")}</Button>
          <Link to="/settings/backup" className="btn">{t("privacy.fullBackup")}</Link>
          <p className="hint">{t("privacy.exportNote")}</p>
        </div></Card>

        <Card><div className="stack">
          <h3>{t("privacy.delete")}</h3>
          <p className="muted small">{t("privacy.deleteText")}</p>
          <Button variant="danger" onClick={() => setDel(true)}><Trash2 />{t("privacy.deleteAll")}</Button>
        </div></Card>
      </div>
      {del ? (
        <ConfirmSheet title={t("privacy.deleteAll")} danger confirmLabel={t("common.delete")} disabled={typed.trim().toUpperCase() !== "DELETE"} onClose={() => { setDel(false); setTyped(""); }}
          onConfirm={async () => { try { await svc.backup.wipeAll(); await reloadSettings(); bump(); toast(t("common.done")); setDel(false); setTyped(""); } catch (e) { fail(e); } }}>
          <p>{t("privacy.deleteConfirm")}</p>
          <TextField label={t("privacy.typeDelete")} value={typed} onChange={(e) => setTyped(e.target.value)} dir="ltr" />
        </ConfirmSheet>
      ) : null}
    </Page>
  );
}
