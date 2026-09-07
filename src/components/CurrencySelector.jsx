import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search, Coins } from "lucide-react";
import { C } from "./theme";
import { CURRENCIES } from "../lib/currencies";

// Edits businesses.currency directly — the same field BusinessSettings
// edits, RLS-protected the same way (owner/admin only). Staff see the
// current code as a read-only badge instead of a broken control, rather
// than an editable dropdown that silently fails to save.
export default function CurrencySelector({ currency, onChange, canEdit }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [search]);

  if (!canEdit) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold" style={{ color: C.slate }} title={t("header.businessCurrency")}>
        <Coins size={14} />
        {currency}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-black/5"
        style={{ color: C.slate }}
        title={t("header.businessCurrency")}
      >
        <Coins size={14} />
        {currency}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-1 w-64 overflow-hidden rounded-xl bg-white shadow-lg" style={{ border: `1px solid ${C.border}` }}>
            <div className="border-b p-2" style={{ borderColor: C.border }}>
              <div className="relative">
                <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2" style={{ color: C.slateLight }} />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("currencySelector.searchPlaceholder")}
                  className="w-full rounded-lg py-1.5 ps-8 pe-2 text-xs outline-none"
                  style={{ backgroundColor: C.bg }}
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs" style={{ color: C.slateLight }}>{t("common.noMatches")}</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => { onChange(c.code); setOpen(false); setSearch(""); }}
                    className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-black/5"
                    style={{ color: C.ink }}
                  >
                    <span>{c.code} — {c.name}</span>
                    {currency === c.code && <Check size={14} color={C.green} />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
