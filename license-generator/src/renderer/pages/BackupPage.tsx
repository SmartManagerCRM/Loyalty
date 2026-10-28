import { useState } from "react";
import { api } from "../api";
import { useGen } from "../App";
import type { ImportPreview } from "../../shared/api";

export function BackupPage() {
  const { go, notify, fail } = useGen();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  return (
    <div className="stack">
      <h1>Backup & restore</h1>
      <div className="banner warn">The license history is local to this computer. If it is lost you keep working, but you lose the record of who has which license. Back it up regularly and keep the signing key backup separately.</div>
      <div className="card stack"><h3>License history</h3>
        <p className="muted small">The backup contains customer names, notes, device codes and the issued license files, with an integrity checksum. It contains no private key.</p>
        <div className="row">
          <button className="btn primary" onClick={async () => { try { const r = await api.exportHistory(); if (r.saved) notify(`Backup saved to ${r.path}`); } catch (e) { fail(e); } }}>Export history backup…</button>
          <button className="btn" onClick={async () => { try { setPreview(await api.pickImport()); } catch (e) { fail(e); } }}>Import history backup…</button>
        </div>
        {preview ? (
          <div className="banner ok stack" style={{ gap: 8 }}>
            <div>Backup is valid: <strong>{preview.added}</strong> new, {preview.identical} already present{preview.conflicts.length ? `, ${preview.conflicts.length} conflicting (will be kept as they are here)` : ""}. Existing records are never overwritten.</div>
            <div className="row"><button className="btn primary" disabled={preview.added === 0} onClick={async () => { try { const r = await api.commitImport(preview.token); setPreview(null); notify(`Imported ${r.added} record(s).`); } catch (e) { fail(e); } }}>Import {preview.added} record(s)</button><button className="btn" onClick={() => setPreview(null)}>Cancel</button></div>
          </div>
        ) : null}
      </div>
      <div className="card stack"><h3>Signing key</h3><p className="muted small">Save an encrypted key backup from the Signing key page. Restoring it on a new computer lets you keep issuing licenses that existing installs accept.</p>
        <div className="row"><button className="btn" onClick={() => go({ name: "key" })}>Open Signing key</button><button className="btn" onClick={() => void api.showDataFolder()}>Show data folder</button></div></div>
    </div>
  );
}
