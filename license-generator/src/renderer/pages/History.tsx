import { useEffect, useState } from "react";
import { api } from "../api";
import { useGen } from "../App";
import type { HistoryRow } from "../../shared/api";
import { fmtDate, stateLabel } from "./util";

export function History() {
  const { go, fail } = useGen();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "lifetime" | "custom_duration">("all");
  const [state, setState] = useState<"all" | "active" | "expiring" | "expired" | "superseded">("all");
  useEffect(() => { api.list({ query, type, state }).then(setRows, fail); }, [query, type, state, fail]);
  return (
    <div className="stack">
      <h1>License history</h1>
      <div className="row wrap">
        <input style={{ maxWidth: 320 }} placeholder="Search customer, notes, device, license ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select style={{ width: 170 }} value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="all">All types</option><option value="lifetime">Lifetime</option><option value="custom_duration">Fixed period</option></select>
        <select style={{ width: 170 }} value={state} onChange={(e) => setState(e.target.value as typeof state)}><option value="all">Any status</option><option value="active">Active</option><option value="expiring">Expiring soon</option><option value="expired">Expired</option><option value="superseded">Replaced</option></select>
      </div>
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table><thead><tr><th>Customer</th><th>Type</th><th>Valid until</th><th>Status</th><th>Device</th><th>Issued</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.licenseId} className="click" onClick={() => go({ name: "details", id: r.licenseId })}>
            <td><strong>{r.customerReference}</strong></td><td>{r.licenseType === "lifetime" ? "Lifetime" : "Fixed period"}</td><td>{fmtDate(r.expiresAt)}</td>
            <td><span className={`badge ${stateLabel[r.state]?.cls}`}>{stateLabel[r.state]?.text}</span></td><td className="mono small">{r.deviceFingerprint.slice(0, 9)}…</td><td>{fmtDate(r.issuedAt)}</td></tr>)}
          {rows.length === 0 ? <tr><td colSpan={6} className="muted">No licenses match.</td></tr> : null}
        </tbody></table>
      </div>
    </div>
  );
}

export function Details({ id }: { id: string }) {
  const { go, notify, fail } = useGen();
  const [r, setR] = useState<(HistoryRow & { compactText: string; summary: string[] }) | null>(null);
  useEffect(() => { api.getLicense(id).then(setR, fail); }, [id, fail]);
  if (!r) return <div className="muted">Loading…</div>;
  const st = stateLabel[r.state]!;
  return (
    <div className="stack">
      <div className="row between"><h1>{r.customerReference}</h1><span className={`badge ${st.cls}`}>{st.text}</span></div>
      <div className="card"><dl className="kv">
        <dt>License ID</dt><dd className="mono">{r.licenseId}</dd><dt>Type</dt><dd>{r.licenseType === "lifetime" ? "Lifetime (no expiry)" : "Fixed period"}</dd>
        <dt>Valid from</dt><dd>{fmtDate(r.validFrom, true)}</dd><dt>Valid until</dt><dd>{fmtDate(r.expiresAt, true)}</dd><dt>Issued</dt><dd>{fmtDate(r.issuedAt, true)}</dd>
        <dt>Device</dt><dd className="mono">{r.deviceFingerprint}</dd><dt>Platform</dt><dd>{r.requestPlatform} · app {r.requestAppVersion}</dd><dt>Signing key</dt><dd>{r.keyId}</dd><dt>Features</dt><dd>{r.features.join(", ")}</dd>
        <dt>Notes</dt><dd>{r.notes || "—"}</dd>
        {r.replaces ? <><dt>Replaces</dt><dd className="mono">{r.replaces}</dd></> : null}
        {r.supersededBy ? <><dt>Replaced by</dt><dd><button className="btn link" onClick={() => go({ name: "details", id: r.supersededBy! })}>{r.supersededBy}</button> ({r.reissueReason})</dd></> : null}
      </dl></div>
      <div className="row wrap">
        <button className="btn primary" onClick={async () => { try { const s = await api.saveLicense(r.licenseId); if (s.saved) notify(`Saved to ${s.path}`); } catch (e) { fail(e); } }}>Save license file again…</button>
        <button className="btn" onClick={async () => { await api.copy(r.compactText); notify("License text copied."); }}>Copy license text</button>
        {r.status === "active" ? <><button className="btn" onClick={() => go({ name: "renew", id: r.licenseId })}>Renew (same device)</button><button className="btn" onClick={() => go({ name: "reissue", id: r.licenseId })}>Replace device…</button></> : null}
        <button className="btn link" onClick={() => go({ name: "history" })}>Back to history</button>
      </div>
    </div>
  );
}
