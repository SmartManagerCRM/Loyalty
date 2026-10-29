import { useState } from "react";
import { api, describeError } from "../api";
import { useGen } from "../App";
import type { IssueDTO, RequestInfo } from "../../shared/api";

const OPTIONS = [
  { v: "lifetime", label: "Lifetime" }, { v: "1", label: "1 month" }, { v: "3", label: "3 months" }, { v: "6", label: "6 months" },
  { v: "12", label: "1 year" }, { v: "24", label: "2 years" },
];

export function Simple() {
  const { key, refreshKey, ensureUnlocked, notify, fail, go } = useGen();
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [period, setPeriod] = useState("lifetime");
  const [res, setRes] = useState<IssueDTO | null>(null);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [fresh, setFresh] = useState(false);

  const parse = async (t: string) => {
    setCode(t); setErr(null); setInfo(null); setRes(null);
    if (!t.trim()) return;
    try { const i = await api.requestParse(t); setInfo(i); if (i.customerReference) setRef((r) => r || i.customerReference!); } catch (e) { setErr(describeError(e)); }
  };

  const generate = async (renewId?: string) => {
    if (!info || !ref.trim()) return;
    if (!(await ensureUnlocked())) return;
    const base = { requestText: code, customerReference: ref, licenseType: period === "lifetime" ? ("lifetime" as const) : ("custom_duration" as const), ...(period === "lifetime" ? {} : { durationMonths: Number(period) }) };
    try { setRes(renewId ? await api.renew({ ...base, renewsLicenseId: renewId }) : await api.issue(base)); } catch (e) { fail(e); }
  };

  if (!key.exists) {
    return (
      <div className="stack" style={{ maxWidth: 520 }}>
        <h1>First-time setup</h1>
        <p className="muted">Choose a passphrase. It protects the key that signs your licenses. You will type it when generating licenses.</p>
        <label className="f">Passphrase (12+ characters)<input type="password" value={p1} onChange={(e) => setP1(e.target.value)} /></label>
        <label className="f">Repeat passphrase<input type="password" value={p2} onChange={(e) => setP2(e.target.value)} /></label>
        <button className="btn primary" disabled={p1.length < 12 || p1 !== p2} onClick={async () => { try { await api.keyCreate(p1); setFresh(true); await refreshKey(); } catch (e) { fail(e); } }}>Create</button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Generate license</h1>
      {fresh ? (
        <div className="banner warn stack" style={{ gap: 8 }}>
          <div><strong>One-time step:</strong> save these two files. The public key goes into the app build; the key backup lets you recover if this computer is lost (keep your passphrase safe too).</div>
          <div className="row"><button className="btn" onClick={async () => { const r = await api.keySavePublic(); if (r.saved) notify("Saved"); }}>Save public key file</button>
            <button className="btn" onClick={async () => { const r = await api.keySaveBackup(); if (r.saved) notify("Saved"); }}>Save key backup</button>
            <button className="btn link" onClick={() => setFresh(false)}>Done</button></div>
        </div>
      ) : null}
      <label className="f">1. Paste the customer's request code<textarea value={code} onChange={(e) => void parse(e.target.value)} placeholder="SMLYREQ1:…" spellCheck={false} style={{ minHeight: 90 }} /></label>
      {err ? <div className="banner danger">{err}</div> : null}
      {info ? (
        <>
          <div className="banner ok">Device ID: <strong className="mono">{info.fingerprint}</strong> ({info.platform})</div>
          <label className="f">2. Customer name<input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
          <label className="f">3. License<select value={period} onChange={(e) => setPeriod(e.target.value)}>{OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select></label>
          {info.existing ? (
            <div className="banner warn stack" style={{ gap: 8 }}>This device already has a license ({info.existing.customerReference}). Generate a new one to replace it?
              <div><button className="btn primary" disabled={!ref.trim()} onClick={() => void generate(info.existing!.licenseId)}>Generate replacement</button></div></div>
          ) : <div><button className="btn primary" disabled={!ref.trim()} onClick={() => void generate()}>Generate license</button></div>}
        </>
      ) : null}
      {res ? (
        <div className="card stack">
          <strong>License ready — send this to the customer:</strong>
          <textarea readOnly value={res.compactText} style={{ minHeight: 90 }} onFocus={(e) => e.target.select()} />
          <div className="row"><button className="btn primary" onClick={async () => { await api.copy(res.compactText); notify("License copied"); }}>Copy license</button>
            <button className="btn" onClick={async () => { const r = await api.saveLicense(res.record.licenseId); if (r.saved) notify("Saved"); }}>Save as file</button></div>
        </div>
      ) : null}
      <div className="row small"><button className="btn link" onClick={() => go({ name: "history" })}>History</button><button className="btn link" onClick={() => go({ name: "key" })}>Key & backup</button></div>
    </div>
  );
}
