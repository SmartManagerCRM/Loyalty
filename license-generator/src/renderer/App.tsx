import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, describeError } from "./api";
import type { KeyStatus } from "../core/keystore";
import { Simple } from "./pages/Simple";
import { NewLicense } from "./pages/NewLicense";
import { History, Details } from "./pages/History";
import { SigningKey } from "./pages/SigningKey";
import { BackupPage } from "./pages/BackupPage";

export type View =
  | { name: "dashboard" } | { name: "new" } | { name: "history" } | { name: "key" } | { name: "backup" }
  | { name: "details"; id: string }
  | { name: "renew"; id: string } | { name: "reissue"; id: string };

interface Ctx {
  key: KeyStatus;
  refreshKey(): Promise<void>;
  go(v: View): void;
  /** Resolves true when the key is unlocked (prompting for the passphrase when needed). */
  ensureUnlocked(): Promise<boolean>;
  notify(text: string, tone?: "ok" | "danger"): void;
  fail(e: unknown): void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useGen = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("no context");
  return c;
};

function UnlockModal({ onDone }: { onDone(ok: boolean): void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await api.keyUnlock(pass); onDone(true); } catch (e) { setErr(describeError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Unlock signing key">
      <form className="modal" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h2>Unlock signing key</h2>
        <p className="muted small">Enter the passphrase that protects your signing key. It stays unlocked for 10 minutes of inactivity.</p>
        <label className="f">Passphrase<input type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" /></label>
        {err ? <div className="banner danger" role="alert">{err}</div> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!pass || busy}>Unlock</button>
        </div>
      </form>
    </div>
  );
}

export function App() {
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [key, setKey] = useState<KeyStatus>({ exists: false, unlocked: false });
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "danger" } | null>(null);
  const [unlock, setUnlock] = useState<((ok: boolean) => void) | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  const refreshKey = useCallback(async () => { const s = await api.keyStatus(); setKey(s); keyRef.current = s; }, []);
  useEffect(() => { void refreshKey(); }, [refreshKey]);

  const notify = useCallback((text: string, tone: "ok" | "danger" = "ok") => { setToast({ text, tone }); setTimeout(() => setToast(null), tone === "danger" ? 8000 : 3500); }, []);
  const ensureUnlocked = useCallback(async () => {
    await refreshKey();
    if (keyRef.current.unlocked) return true;
    if (!keyRef.current.exists) { notify(describeError({ code: "no_key" }), "danger"); return false; }
    return new Promise<boolean>((resolve) => setUnlock(() => (ok: boolean) => { setUnlock(null); void refreshKey(); resolve(ok); }));
  }, [refreshKey, notify]);

  const ctx: Ctx = { key, refreshKey, go: setView, ensureUnlocked, notify, fail: (e) => notify(describeError(e), "danger") };

  let page: ReactNode;
  switch (view.name) {
    case "dashboard": case "new": page = <Simple />; break;
    case "renew": page = <NewLicense mode={{ kind: "renew", id: view.id }} />; break;
    case "reissue": page = <NewLicense mode={{ kind: "reissue", id: view.id }} />; break;
    case "history": page = <History />; break;
    case "details": page = <Details id={view.id} />; break;
    case "key": page = <SigningKey />; break;
    case "backup": page = <BackupPage />; break;
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <header className="row between" style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)" }}>
          <strong>SmartManager Loyalty · License Generator</strong>
          <span className="row small">
            <button className="btn link" onClick={() => setView({ name: "new" })}>Generate</button>
            <button className="btn link" onClick={() => setView({ name: "history" })}>History</button>
            <button className="btn link" onClick={() => setView({ name: "key" })}>Key</button>
            <button className="btn link" onClick={() => setView({ name: "backup" })}>Backup</button>
          </span>
        </header>
        <main>{page}</main>
      </div>
      {unlock ? <UnlockModal onDone={unlock} /> : null}
      {toast ? <div className={`banner ${toast.tone}`} role="status" style={{ position: "fixed", bottom: 20, right: 20, maxWidth: 420, boxShadow: "0 8px 30px rgba(0,0,0,.25)" }}>{toast.text}</div> : null}
    </AppCtx.Provider>
  );
}
