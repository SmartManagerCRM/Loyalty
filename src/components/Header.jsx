import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu, Search, LogOut, ChevronDown } from "lucide-react";
import { C } from "./theme";
import Logo from "./Logo";
import LanguageSelector from "./LanguageSelector";
import CurrencySelector from "./CurrencySelector";
import GlobalSearch from "./GlobalSearch";
import { useAuth } from "../context/AuthContext";
import { useUILanguage } from "../lib/uiPrefs";
import { getPageMeta } from "../lib/routeMeta";
import { supabase } from "../lib/supabaseClient";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", manager: "Manager", staff: "Staff" };

function UserMenu() {
  const { user, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const initials = (user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-black/5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: C.navy }}>
          {initials}
        </div>
        <div className="hidden text-left md:block">
          <div className="max-w-[140px] truncate text-xs font-semibold" style={{ color: C.ink }}>{user?.email}</div>
          <div className="text-[10px]" style={{ color: C.slateLight }}>{ROLE_LABEL[role] || "—"}</div>
        </div>
        <ChevronDown size={14} className="hidden md:block" style={{ color: C.slateLight }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-xl bg-white py-1 shadow-lg" style={{ border: `1px solid ${C.border}` }}>
            <div className="border-b px-3 py-2" style={{ borderColor: C.border }}>
              <div className="truncate text-xs font-semibold" style={{ color: C.ink }}>{user?.email}</div>
              <div className="text-[10px]" style={{ color: C.slateLight }}>{ROLE_LABEL[role] || "—"}</div>
            </div>
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
              style={{ color: C.red }}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Header({ onOpenMobileMenu }) {
  const { business, role, refreshBusiness } = useAuth();
  const { language, setLanguage } = useUILanguage();
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const meta = getPageMeta(location.pathname);
  const canEditCurrency = role === "owner" || role === "admin";

  useEffect(() => {
    function handleKeydown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  async function handleCurrencyChange(code) {
    await supabase.from("businesses").update({ currency: code }).eq("id", business.id);
    refreshBusiness();
  }

  return (
    <header
      className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6"
      style={{ backgroundColor: C.white, borderColor: C.border }}
    >
      <button onClick={onOpenMobileMenu} className="rounded-lg p-1.5 hover:bg-black/5 lg:hidden">
        <Menu size={20} style={{ color: C.navy }} />
      </button>

      <div className="shrink-0 lg:hidden">
        <Logo size={28} />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-bold md:text-base" style={{ color: C.ink }}>{meta.title}</h1>
        {meta.subtitle && <p className="hidden truncate text-xs md:block" style={{ color: C.slateLight }}>{meta.subtitle}</p>}
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        className="hidden items-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:flex"
        style={{ backgroundColor: C.bg, color: C.slateLight }}
      >
        <Search size={14} />
        Search customers…
        <kbd className="rounded border px-1 text-[10px]" style={{ borderColor: C.border, color: C.slateLight }}>⌘K</kbd>
      </button>
      <button onClick={() => setSearchOpen(true)} className="rounded-lg p-1.5 hover:bg-black/5 sm:hidden">
        <Search size={18} style={{ color: C.navy }} />
      </button>

      <div className="hidden items-center gap-1 md:flex">
        <LanguageSelector language={language} onChange={setLanguage} />
        <CurrencySelector currency={business?.currency || "SAR"} onChange={handleCurrencyChange} canEdit={canEditCurrency} />
      </div>

      <div className="h-6 w-px shrink-0" style={{ backgroundColor: C.border }} />

      <UserMenu />

      <GlobalSearch businessId={business?.id} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
