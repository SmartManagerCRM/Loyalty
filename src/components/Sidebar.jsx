import React from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Users, Target, RotateCcw, ShieldCheck, Gift, Crown, Sparkles, BarChart3,
  Settings, LogOut, X,
} from "lucide-react";
import { C } from "./theme";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";

const NAV = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, end: true },
  { to: "/customers", labelKey: "nav.customers", icon: Users },
  { to: "/recovery", labelKey: "nav.recovery", icon: Target },
  { to: "/reactivation", labelKey: "nav.reactivation", icon: RotateCcw },
  { to: "/retention", labelKey: "nav.retention", icon: ShieldCheck },
  { to: "/rewards", labelKey: "nav.rewards", icon: Gift },
  { to: "/vip", labelKey: "nav.vip", icon: Crown },
  { to: "/offers", labelKey: "nav.smartOffers", icon: Sparkles },
  { to: "/analytics", labelKey: "nav.analytics", icon: BarChart3 },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

// Persistent column on desktop (lg+); off-canvas drawer below that,
// toggled by the header's menu button. `open`/`onClose` are ignored at
// lg+ since the drawer transform is overridden back to visible there.
export default function Sidebar({ open, onClose }) {
  const { t } = useTranslation();
  const { business, memberships, switchBusiness, signOut } = useAuth();

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 start-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-e transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:rtl:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
        style={{ borderColor: C.border, backgroundColor: C.white }}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Logo variant="wordmark" size={36} />
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-black/5 lg:hidden">
            <X size={18} style={{ color: C.slateLight }} />
          </button>
        </div>

        {business && (
          memberships.length > 1 ? (
            <select
              value={business.id}
              onChange={(e) => switchBusiness(e.target.value)}
              className="mx-3 mb-2 rounded-xl px-3 py-2 text-xs font-semibold outline-none"
              style={{ backgroundColor: C.greenTint, color: C.greenDeep, border: "none" }}
            >
              {memberships.map((m) => (
                <option key={m.businesses.id} value={m.businesses.id}>{m.businesses.name}</option>
              ))}
            </select>
          ) : (
            <div className="mx-3 mb-2 rounded-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: C.greenTint, color: C.greenDeep }}>
              {business.name}
            </div>
          )
        )}

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? "" : "hover:bg-black/5"}`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? C.green : "transparent",
                color: isActive ? C.white : C.navy,
              })}
            >
              <n.icon size={17} />
              {t(n.labelKey)}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={signOut}
          className="mx-3 mb-4 mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-black/5"
          style={{ color: C.slate }}
        >
          <LogOut size={17} />
          {t("common.signOut")}
        </button>
      </aside>
    </>
  );
}
