import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Building2, CreditCard, Layers, Receipt, Hourglass, LogOut, X, Menu, ShieldCheck,
} from "lucide-react";
import { C } from "../components/theme";
import LanguageSelector from "../components/LanguageSelector";
import { useUILanguage } from "../lib/uiPrefs";

const NAV = [
  { to: "/admin", labelKey: "admin.nav.overview", icon: LayoutDashboard, end: true },
  { to: "/admin/businesses", labelKey: "admin.nav.businesses", icon: Building2 },
  { to: "/admin/subscriptions", labelKey: "admin.nav.subscriptions", icon: Layers },
  { to: "/admin/plans", labelKey: "admin.nav.plans", icon: CreditCard },
  { to: "/admin/payments", labelKey: "admin.nav.payments", icon: Receipt },
  { to: "/admin/trials", labelKey: "admin.nav.trials", icon: Hourglass },
];

// Deliberately its own visual identity (dark navy sidebar, "PLATFORM
// ADMIN" badge) so this never reads as just another tenant page — anyone
// who lands here, even a normal business owner who guessed the URL and
// somehow got past AdminGate, should immediately recognize they're
// somewhere different.
function AdminSidebar({ open, onClose }) {
  const { t } = useTranslation();
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 start-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-y-auto transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:rtl:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
        style={{ backgroundColor: C.navyDeep }}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: C.navySoft }}>
              <ShieldCheck size={17} color={C.white} />
            </div>
            <div>
              <div className="text-sm font-bold text-white">SmartManager</div>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.greenTint }}>{t("admin.common.platformAdmin")}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/10 lg:hidden">
            <X size={18} style={{ color: "#B9C6D6" }} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 pt-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? "" : "hover:bg-white/5"}`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? C.navySoft : "transparent",
                color: isActive ? C.white : "#B9C6D6",
              })}
            >
              <n.icon size={17} />
              {t(n.labelKey)}
            </NavLink>
          ))}
        </nav>

        <a
          href="/"
          className="mx-3 mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-white/5"
          style={{ color: "#B9C6D6" }}
        >
          {t("admin.common.exitToApp")}
        </a>
      </aside>
    </>
  );
}

function AdminHeader({ onOpenMobileMenu, onSignOut }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { language, setLanguage } = useUILanguage();
  const path = location.pathname;
  const titleKey = path === "/admin" ? "admin.overview.title"
    : path.startsWith("/admin/businesses") ? "admin.businesses.title"
    : path.startsWith("/admin/subscriptions") ? "admin.subscriptions.title"
    : path.startsWith("/admin/plans") ? "admin.plans.title"
    : path.startsWith("/admin/payments") ? "admin.payments.title"
    : path.startsWith("/admin/trials") ? "admin.trials.title"
    : "admin.overview.title";

  return (
    <header
      className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6"
      style={{ backgroundColor: C.white, borderColor: C.border }}
    >
      <button onClick={onOpenMobileMenu} className="rounded-lg p-1.5 hover:bg-black/5 lg:hidden">
        <Menu size={20} style={{ color: C.navy }} />
      </button>
      <h1 className="flex-1 truncate text-sm font-bold md:text-base" style={{ color: C.ink }}>{t(titleKey)}</h1>
      <LanguageSelector language={language} onChange={setLanguage} />
      <button
        onClick={onSignOut}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-black/5"
        style={{ color: C.slate }}
      >
        <LogOut size={14} />
        {t("common.signOut")}
      </button>
    </header>
  );
}

export default function AdminShell({ children, mobileNavOpen, onOpenMobileMenu, onCloseMobileMenu, onSignOut }) {
  return (
    <div className="flex h-screen w-full" style={{ backgroundColor: C.bg }}>
      <AdminSidebar open={mobileNavOpen} onClose={onCloseMobileMenu} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader onOpenMobileMenu={onOpenMobileMenu} onSignOut={onSignOut} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
