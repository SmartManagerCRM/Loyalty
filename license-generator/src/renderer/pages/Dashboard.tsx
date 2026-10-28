import { useEffect, useState } from "react";
import { api } from "../api";
import { useGen } from "../App";
import type { Summary } from "../../shared/api";
import { fmtDate } from "./util";

export function Dashboard() {
  const { key, go, fail } = useGen();
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => { api.summary().then(setS, fail); }, [fail]);
  return (
    <div className="stack">
      <div><h1>Dashboard</h1><p className="muted">Issue and track SmartManager Loyalty licenses. Everything happens on this computer, offline.</p></div>
      {!key.exists ? (
        <div className="banner warn"><strong>Set up your signing key first.</strong> Licenses can only be issued after you create the key that signs them.
          <div style={{ marginTop: 8 }}><button className="btn primary" onClick={() => go({ name: "key" })}>Create signing key</button></div></div>
      ) : (
        <div className="row"><button className="btn primary" onClick={() => go({ name: "new" })}>Issue a new license</button><button className="btn" onClick={() => go({ name: "history" })}>License history</button></div>
      )}
      {s ? (
        <>
          <div className="grid">
            <div className="stat"><div className="v">{s.total}</div><div className="l">Licenses issued</div></div>
            <div className="stat"><div className="v">{s.activeLifetime}</div><div className="l">Active lifetime</div></div>
            <div className="stat"><div className="v">{s.activeCustom}</div><div className="l">Active fixed-period</div></div>
            <div className="stat"><div className="v">{s.expiring}</div><div className="l">Expiring within 30 days</div></div>
            <div className="stat"><div className="v">{s.expired}</div><div className="l">Expired</div></div>
            <div className="stat"><div className="v">{s.superseded}</div><div className="l">Replaced / renewed</div></div>
          </div>
          {s.expiringSoon.length ? (
            <div className="card stack"><h3>Expiring soon</h3>
              <table><thead><tr><th>Customer</th><th>Expires</th><th /></tr></thead><tbody>
                {s.expiringSoon.map((r) => <tr key={r.licenseId}><td>{r.customerReference}</td><td>{fmtDate(r.expiresAt)}</td><td><button className="btn" onClick={() => go({ name: "renew", id: r.licenseId })}>Renew</button></td></tr>)}
              </tbody></table></div>
          ) : null}
        </>
      ) : null}
      <div className="banner">Licenses are checked by the app without internet. An offline license cannot be revoked remotely, so issue fixed-period licenses when you may need to end access.</div>
    </div>
  );
}
