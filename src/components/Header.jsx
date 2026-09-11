import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, Search, LogOut, ChevronDown, ShieldCheck } from "lucide-react";
import { C } from "./theme";
import Logo from "./Logo";
import LanguageSelector from "./LanguageSelector";
import CurrencySelector from "./CurrencySelector";
import GlobalSearch from "./GlobalSearch";
import { useAuth } from "../context/AuthContext";
import { useUILanguage } from "../lib/uiPrefs";
import { useIsPlatformAdmin } from "../lib/useIsPlatformAdmin";
import { getPageMetaKey } from "../lib/routeMeta";
import { supabase } from "../lib/supabaseClient";

function UserMenu() {
  const { t } = useTranslation();
  const { user, role, signOut } = useAuth();
  const { isAdmin } = useIsPlatformAdmin(user?.id);
  const [open, setOpen] = useState(false);
  const initials = (user?.email || "?").slice(0, 2).toUpperCase();
  const roleLabel = role ? t(`roles.${role}`) : "—";

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-lg py-1.5 ps-1 pe-2.5 hover:bg-black/5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: C.navy }}>
          {initials}
        </div>
        <div className="hidden text-start md:block">
          <div className="max-w-[160px] truncate text-sm font-semibold" style={{ color: C.ink }}>{user?.email}</div>
          <div className="text-xs" style={{ color: C.slateLight }}>{roleLabel}</div>
        </div>
        <ChevronDown size={16} className="hidden md:block" style={{ color: C.slateLight }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-1 w-52 overflow-hidden rounded-xl bg-white py-1 shadow-lg" style={{ border: `1px solid ${C.border}` }}>
            <div className="border-b px-3 py-2" style={{ borderColor: C.border }}>
              <div className="truncate text-xs font-semibold" style={{ color: C.ink }}>{user?.email}</div>
              <div className="text-[10px]" style={{ color: C.slateLight }}>{roleLabel}</div>
            </div>
            {isAdmin && (
              <a
                href="/admin"
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-black/5"
                style={{ color: C.navy }}
              >
                <ShieldCheck size={14} />
                {t("admin.common.platformAdmin")}
              </a>
            )}
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-black/5"
              style={{ color: C.red }}
            >
              <LogOut size={14} />
              {t("common.signOut")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Header({ onOpenMobileMenu }) {
  const { t } = useTranslation();
  const { business, role, refreshBusiness } = useAuth();
  const { language, setLanguage } = useUILanguage();
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const metaKey = getPageMetaKey(location.pathname);
  const metaTitle = t(`pageMeta.${metaKey}.title`);
  const metaSubtitle = t(`pageMeta.${metaKey}.subtitle`);
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
      className="sticky top-0 z-30 flex shrink-0 flex-col border-b"
      style={{ backgroundColor: C.white, borderColor: C.border }}
    >
      <div className="flex items-center gap-4 px-5 py-5 md:px-8 md:py-6">
        <button onClick={onOpenMobileMenu} className="rounded-lg p-1.5 hover:bg-black/5 lg:hidden">
          <Menu size={22} style={{ color: C.navy }} />
        </button>

        <div className="shrink-0 lg:hidden">
          <Logo size={32} />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold md:text-3xl" style={{ color: C.ink }}>{metaTitle}</h1>
          {metaSubtitle && <p className="mt-0.5 truncate text-xs md:text-sm" style={{ color: C.slateLight }}>{metaSubtitle}</p>}
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="hidden items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm sm:flex"
          style={{ backgroundColor: C.bg, color: C.slateLight }}
        >
          <Search size={16} />
          {t("header.searchPlaceholder")}
          <kbd className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: C.border, color: C.slateLight }}>⌘K</kbd>
        </button>
        <button onClick={() => setSearchOpen(true)} className="rounded-lg p-1.5 hover:bg-black/5 sm:hidden">
          <Search size={18} style={{ color: C.navy }} />
        </button>

        <div className="hidden items-center gap-1 md:flex">
          <LanguageSelector language={language} onChange={setLanguage} />
          <CurrencySelector currency={business?.currency || "SAR"} onChange={handleCurrencyChange} canEdit={canEditCurrency} />
        </div>

        <div className="h-8 w-px shrink-0" style={{ backgroundColor: C.border }} />

        <UserMenu />
      </div>

      {/* Own row on mobile so the language/currency controls stay fully
          visible instead of competing with the title and user menu for
          space in one crowded line (md+ shows them inline above instead). */}
      <div className="flex items-center gap-1 border-t px-5 py-2 md:hidden" style={{ borderColor: C.border }}>
        <LanguageSelector language={language} onChange={setLanguage} />
        <CurrencySelector currency={business?.currency || "SAR"} onChange={handleCurrencyChange} canEdit={canEditCurrency} />
      </div>

      <GlobalSearch businessId={business?.id} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
