import { useEffect, useState } from "react";
import { api, describeError } from "../api";
import { useGen } from "../App";
import type { HistoryRow, IssueDTO, RequestInfo } from "../../shared/api";
import { fmtDate, todayYmd } from "./util";

type Mode = { kind: "new" } | { kind: "renew"; id: string } | { kind: "reissue"; id: string };
const MONTHS = [1, 3, 6, 12, 24, 36];

export function NewLicense({ mode }: { mode: Mode }) {
  const { key, go, ensureUnlocked, notify, fail } = useGen();
  const [old, setOld] = useState<HistoryRow | null>(null);
  const [requestText, setRequestText] = useState("");
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [reqError, setReqError] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<"lifetime" | "custom_duration">("custom_duration");
  const [how, setHow] = useState<"months" | "date">("months");
  const [months, setMonths] = useState(12);
  const [expiresOn, setExpiresOn] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IssueDTO | null>(null);

  useEffect(() => {
    if (mode.kind === "new") return;
    api.getLicense(mode.id).then((r) => { if (r) { setOld(r); setReference(r.customerReference); setType(r.licenseType); setNotes(r.notes); } }, fail);
  }, [mode, fail]);

  const parse = async (text: string) => {
    setRequestText(text);
    setReqError(null);
    setInfo(null);
    if (!text.trim()) return;
    try {
      const i = await api.requestParse(text);
      setInfo(i);
      if (!reference && i.customerReference) setReference(i.customerReference);
    } catch (e) { setReqError(describeError(e)); }
  };
  const openFile = async () => { try { const f = await api.requestOpen(); if (f) await parse(f.text); } catch (e) { fail(e); } };

  const existingBlocks = mode.kind === "new" && info?.existing;
  const sameDeviceInReissue = mode.kind === "reissue" && old && info && info.fingerprint === old.deviceFingerprint;
  const diffDeviceInRenew = mode.kind === "renew" && old && info && info.fingerprint !== old.deviceFingerprint;
  const needsExpiry = type === "custom_duration" && how === "date" && !expiresOn;
  const ready = !!info && reference.trim() && !existingBlocks && !sameDeviceInReissue && !diffDeviceInRenew && !needsExpiry &&
    (mode.kind !== "reissue" || (reason.trim().length >= 5 && confirmed));

  const issue = async () => {
    if (!info) return;
    if (!(await ensureUnlocked())) return;
    setBusy(true);
    try {
      const base = {
        requestText, customerReference: reference, notes, licenseType: type,
        ...(type === "custom_duration" ? (how === "months" ? { durationMonths: months } : { expiresOn }) : {}),
      };
      const res = mode.kind === "renew" ? await api.renew({ ...base, renewsLicenseId: mode.id })
        : mode.kind === "reissue" ? await api.reissue({ ...base, replacesLicenseId: mode.id, reason, confirmed })
        : await api.issue(base);
      setResult(res);
      notify("License issued and recorded.");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  if (!key.exists) return <div className="stack"><h1>New license</h1><div className="banner warn">Create your signing key first.</div><button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={() => go({ name: "key" })}>Go to Signing key</button></div>;

  if (result) {
    return (
      <div className="stack">
        <h1>License issued</h1>
        <div className="banner ok">Signed with key {result.record.keyId} and saved to the history. Send the file (or the text) to the customer.</div>
        <div className="card stack"><pre className="summary">{result.summary.join("\n")}</pre>
          <div className="row wrap">
            <button className="btn primary" onClick={async () => { try { const r = await api.saveLicense(result.record.licenseId); if (r.saved) notify(`Saved to ${r.path}`); } catch (e) { fail(e); } }}>Save license file…</button>
            <button className="btn" onClick={async () => { await api.copy(result.compactText); notify("License text copied. Paste it into the app's activation screen."); }}>Copy license text</button>
            <button className="btn link" onClick={() => go({ name: "details", id: result.record.licenseId })}>View record</button>
            <button className="btn link" onClick={() => go({ name: "new" })}>Issue another</button>
          </div></div>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>{mode.kind === "new" ? "New license" : mode.kind === "renew" ? "Renew license (same device)" : "Replace device (reissue)"}</h1>
      <div className="steps"><div className={`step ${info ? "done" : "on"}`}>1. Activation request</div><div className={`step ${info ? "on" : ""}`}>2. License options</div><div className="step">3. Issue & save</div></div>

      {old ? <div className="banner">{mode.kind === "reissue" ? "Replacing" : "Renewing"}: <strong>{old.customerReference}</strong> · {old.licenseType === "lifetime" ? "Lifetime" : `until ${fmtDate(old.expiresAt)}`} · device <span className="mono">{old.deviceFingerprint}</span></div> : null}

      <div className="card stack">
        <h3>{mode.kind === "reissue" ? "Activation request from the NEW device" : "Activation request"}</h3>
        <p className="muted small">The customer exports this from the app's activation screen (file, or the copied text starting with SMLYREQ1:).</p>
        <div className="row"><button className="btn" onClick={() => void openFile()}>Open request file…</button></div>
        <textarea placeholder="…or paste the request text here" value={requestText} onChange={(e) => void parse(e.target.value)} spellCheck={false} />
        {reqError ? <div className="banner danger" role="alert">{reqError}</div> : null}
        {info ? (
          <dl className="kv"><dt>Product</dt><dd>SmartManager Loyalty</dd><dt>Device fingerprint</dt><dd className="mono">{info.fingerprint}</dd><dt>Platform</dt><dd>{info.platform} · app {info.appVersion}</dd>
            <dt>Request created</dt><dd>{fmtDate(info.createdAt, true)}</dd><dt>Customer hint</dt><dd>{info.customerReference ?? "—"}</dd></dl>
        ) : null}
        {existingBlocks ? <div className="banner warn">This device already has an active license for <strong>{info!.existing!.customerReference}</strong>. To extend it, open it in License history and choose Renew. Issuing a second license for the same device is blocked.</div> : null}
        {sameDeviceInReissue ? <div className="banner warn">This request is from the same device as the old license. Use Renew instead.</div> : null}
        {diffDeviceInRenew ? <div className="banner warn">This request is from a different device. Use Replace device (reissue) instead.</div> : null}
      </div>

      <div className="card stack">
        <h3>License options</h3>
        <label className="f">Customer / business reference<input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} /></label>
        <label className="f">Internal notes (stored locally only, not in the license)<textarea style={{ minHeight: 70, fontFamily: "inherit" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="stack" style={{ gap: 8 }}>
          <label className={`radio ${type === "lifetime" ? "on" : ""}`}><input type="radio" checked={type === "lifetime"} onChange={() => setType("lifetime")} /><span><strong>Lifetime</strong><br /><span className="muted small">No expiry. Still requires a valid signature, this product and this device.</span></span></label>
          <label className={`radio ${type === "custom_duration" ? "on" : ""}`}><input type="radio" checked={type === "custom_duration"} onChange={() => setType("custom_duration")} /><span><strong>Fixed period</strong><br /><span className="muted small">Valid until a date. After that the app becomes read-only; data is kept and can still be exported.</span></span></label>
        </div>
        {type === "custom_duration" ? (
          <div className="row wrap">
            <label className="f" style={{ width: 200 }}>Choose by<select value={how} onChange={(e) => setHow(e.target.value as "months" | "date")}><option value="months">Duration</option><option value="date">End date</option></select></label>
            {how === "months" ? <label className="f" style={{ width: 200 }}>Months<select value={months} onChange={(e) => setMonths(Number(e.target.value))}>{MONTHS.map((m) => <option key={m} value={m}>{m} {m === 1 ? "month" : "months"}</option>)}</select></label>
              : <label className="f" style={{ width: 200 }}>Valid through (end of day, this computer's time)<input type="date" min={todayYmd()} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></label>}
          </div>
        ) : null}
        <div className="muted small">Entitlements: <span className="badge ok">core</span></div>
      </div>

      {mode.kind === "reissue" ? (
        <div className="card stack">
          <h3>Confirm device replacement</h3>
          <div className="banner warn">Offline licenses cannot be revoked remotely: the old device keeps working with its existing license. Only replace a device when that is acceptable (lost or broken phone, or a trusted customer).</div>
          <label className="f">Reason (required)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer replaced a lost phone" /></label>
          <label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm the old device is being replaced and this will be recorded in the history.</label>
        </div>
      ) : null}

      <div className="row"><button className="btn primary" disabled={!ready || busy} onClick={() => void issue()}>Sign & issue license</button><span className="muted small">You will be asked for the key passphrase if the key is locked.</span></div>
    </div>
  );
}
