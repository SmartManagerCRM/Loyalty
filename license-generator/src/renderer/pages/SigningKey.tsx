import { useState } from "react";
import { api } from "../api";
import { useGen } from "../App";

export function SigningKey() {
  const { key, refreshKey, ensureUnlocked, notify, fail } = useGen();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [restorePass, setRestorePass] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);

  const create = async () => {
    setBusy(true);
    try { await api.keyCreate(p1); setP1(""); setP2(""); setCreated(true); await refreshKey(); notify("Signing key created. Now save the public key file and an encrypted backup."); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <h1>Signing key</h1>
      {!key.exists ? (
        <>
          <div className="banner warn"><strong>Read this first.</strong> Every license is signed with one key. The app only accepts licenses signed by the public half of that key, which you build into the app. <strong>If you lose the key or its passphrase you cannot issue licenses that existing installs accept.</strong> A new key would require releasing a new app version.</div>
          <div className="card stack">
            <h3>Create your signing key</h3>
            <label className="f">Passphrase (12+ characters)<input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" /></label>
            <label className="f">Repeat passphrase<input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></label>
            <label className="check"><input type="checkbox" checked={c1} onChange={(e) => setC1(e.target.checked)} /> I understand a lost key or passphrase cannot be recovered.</label>
            <label className="check"><input type="checkbox" checked={c2} onChange={(e) => setC2(e.target.checked)} /> I will save an encrypted backup of the key to a safe place right after creating it.</label>
            <button className="btn primary" style={{ alignSelf: "flex-start" }} disabled={busy || p1.length < 12 || p1 !== p2 || !c1 || !c2} onClick={() => void create()}>Create signing key</button>
          </div>
          <div className="card stack">
            <h3>Already have a key backup?</h3>
            <p className="muted small">Restore your encrypted key file (.smlkey) on this computer. Licenses issued here will be accepted by existing installs.</p>
            <label className="f">Passphrase of the backup<input type="password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} /></label>
            <button className="btn" style={{ alignSelf: "flex-start" }} disabled={!restorePass} onClick={async () => { try { const s = await api.keyRestore(restorePass); if (s) { setRestorePass(""); await refreshKey(); notify("Signing key restored."); } } catch (e) { fail(e); } }}>Choose backup file & restore…</button>
          </div>
        </>
      ) : (
        <>
          {created ? <div className="banner warn"><strong>Do these two steps now:</strong> save the public key file for the app build, and save an encrypted key backup somewhere safe (not only on this computer).</div> : null}
          <div className="card"><dl className="kv"><dt>Key ID</dt><dd className="mono">{key.keyId}</dd><dt>Public key</dt><dd className="mono">{key.publicKey}</dd><dt>Created</dt><dd>{key.createdAt}</dd><dt>State</dt><dd>{key.unlocked ? "Unlocked" : "Locked"}</dd></dl>
            <div className="row" style={{ marginTop: 12 }}>{key.unlocked ? <button className="btn" onClick={async () => { await api.keyLock(); await refreshKey(); }}>Lock now</button> : <button className="btn" onClick={() => void ensureUnlocked()}>Unlock…</button>}</div></div>

          <div className="card stack"><h3>Use this key in the app</h3>
            <p className="muted small">The mobile app contains only the <em>public</em> key. Save this file as <code>app/trusted-keys.json</code> (or set the CI variable <code>LICENSE_TRUSTED_KEYS</code>) and rebuild the app. Several keys can be listed to prepare for a future rotation.</p>
            <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={async () => { try { const r = await api.keySavePublic(); if (r.saved) notify(`Saved to ${r.path}`); } catch (e) { fail(e); } }}>Save public key file…</button></div>

          <div className="card stack"><h3>Back up the signing key</h3>
            <p className="muted small">The backup is an <strong>encrypted copy</strong> protected by the same passphrase. There is deliberately no way to export the raw private key. Store the .smlkey file and the passphrase separately, in at least two safe places.</p>
            <button className="btn" style={{ alignSelf: "flex-start" }} onClick={async () => { try { const r = await api.keySaveBackup(); if (r.saved) notify(`Encrypted key backup saved to ${r.path}`); } catch (e) { fail(e); } }}>Save encrypted key backup…</button></div>
          <div className="banner">An existing key cannot be replaced from this tool. Replacing it would silently stop every issued license from verifying.</div>
        </>
      )}
    </div>
  );
}
