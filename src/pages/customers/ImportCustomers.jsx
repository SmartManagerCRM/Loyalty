import React, { useState } from "react";
import { Upload } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Modal } from "../../components/ui";
import { parseSpreadsheetFile, rowsToCustomers } from "../../lib/csvImport";
import { supabase } from "../../lib/supabaseClient";

export default function ImportCustomers({ businessId, onClose, onImported }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const rawRows = await parseSpreadsheetFile(file);
      const { customers, skipped } = rowsToCustomers(rawRows);
      if (customers.length === 0) throw new Error("No valid rows found — make sure there's a Name column.");

      const { error: insertError } = await supabase
        .from("customers")
        .insert(customers.map((c) => ({ ...c, business_id: businessId })));
      if (insertError) throw insertError;

      const now = Date.now();
      const inactive60 = customers.filter((c) => c.import_last_visit_date && (now - new Date(c.import_last_visit_date)) / 86400000 >= 60).length;
      const highValueInactive = customers.filter((c) =>
        c.import_last_visit_date && (now - new Date(c.import_last_visit_date)) / 86400000 >= 60 && Number(c.import_total_spending || 0) >= 1000
      ).length;
      const dueSoon = customers.filter((c) => {
        if (!c.import_last_visit_date || !c.import_total_visits || c.import_total_visits < 2) return false;
        const days = (now - new Date(c.import_last_visit_date)) / 86400000;
        return days >= 20 && days < 35;
      }).length;

      setSummary({ total: customers.length, skipped, inactive60, highValueInactive, dueSoon });
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import customers" onClose={onClose} wide>
      {!summary ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: C.slate }}>
            Upload a CSV or Excel file. We recognize columns like <strong>Name</strong>, <strong>Phone</strong>,
            <strong> Email</strong>, <strong>Last Visit</strong>, <strong>Total Visits</strong>, and <strong>Total Spending</strong> —
            headers are matched flexibly, and any missing column just defaults sensibly.
          </p>
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center hover:bg-black/[0.02]"
            style={{ borderColor: C.border }}
          >
            <Upload size={22} color={C.slateLight} />
            <span className="text-sm font-semibold" style={{ color: C.ink }}>
              {busy ? "Importing…" : "Click to choose a .csv, .xlsx, or .xls file"}
            </span>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} disabled={busy} />
          </label>
          {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-lg font-bold" style={{ color: C.ink }}>Your business has {summary.total} customers.</p>
          <ul className="space-y-2 text-sm" style={{ color: C.slate }}>
            {summary.inactive60 > 0 && <li>• <strong>{summary.inactive60}</strong> customers have not returned in 60+ days.</li>}
            {summary.highValueInactive > 0 && <li>• <strong>{summary.highValueInactive}</strong> high-value customers are inactive.</li>}
            {summary.dueSoon > 0 && <li>• <strong>{summary.dueSoon}</strong> customers are due for a return.</li>}
            {summary.skipped > 0 && <li className="pt-2" style={{ color: C.slateLight }}>{summary.skipped} rows were skipped (missing a name).</li>}
          </ul>
          <Btn onClick={onClose} className="w-full justify-center">See my dashboard</Btn>
        </div>
      )}
    </Modal>
  );
}
