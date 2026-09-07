import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, X, User } from "lucide-react";
import { C } from "./theme";
import { supabase } from "../lib/supabaseClient";
import { primarySegment } from "../lib/segmentation";

// Cmd/Ctrl+K quick customer search. Queries live (debounced, limit 8)
// rather than filtering a client-side cache, since a business can have
// thousands of customers and shipping all of them to the browser just to
// search is exactly what "performance" in the product brief warns against.
export default function GlobalSearch({ businessId, open, onClose }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeydown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !query.trim() || !businessId) { setResults([]); return; }
    setLoading(true);
    const q = query.trim();
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("customer_overview")
        .select("customer_id, name, phone, email, days_since_last_visit, total_spending, is_new, is_active, is_due, is_inactive, is_lost, is_vip, is_high_value, is_frequent, is_at_risk")
        .eq("business_id", businessId)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      setResults(data || []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, businessId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: C.border }}>
          <Search size={16} style={{ color: C.slateLight }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("globalSearch.placeholder")}
            className="flex-1 text-sm outline-none"
          />
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-black/5">
            <X size={16} style={{ color: C.slateLight }} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && <p className="px-4 py-6 text-center text-xs" style={{ color: C.slateLight }}>{t("globalSearch.searching")}</p>}
          {!loading && query.trim() && results.length === 0 && (
            <p className="px-4 py-6 text-center text-xs" style={{ color: C.slateLight }}>{t("globalSearch.noResults", { query })}</p>
          )}
          {!loading && results.map((r) => {
            const seg = primarySegment(r);
            return (
              <button
                key={r.customer_id}
                onClick={() => { navigate(`/customers/${r.customer_id}`); onClose(); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-black/5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: C.bg }}>
                  <User size={14} style={{ color: C.slateLight }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" style={{ color: C.ink }}>{r.name}</div>
                  <div className="truncate text-xs" style={{ color: C.slateLight }}>{r.phone || r.email || "—"}</div>
                </div>
                {seg && (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: seg.color, backgroundColor: `${seg.color}1a` }}>
                    {seg.label}
                  </span>
                )}
              </button>
            );
          })}
          {!query.trim() && (
            <p className="px-4 py-6 text-center text-xs" style={{ color: C.slateLight }}>{t("globalSearch.startTyping")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
