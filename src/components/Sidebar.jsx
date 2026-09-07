import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Target, RotateCcw, ShieldCheck, Gift, Crown, Sparkles, BarChart3,
  Sliders, UsersRound, Building2, CreditCard, LogOut, X,
} from "lucide-react";
import { C } from "./theme";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/recovery", label: "Recovery", icon: Target },
  { to: "/reactivation", label: "Reactivation", icon: RotateCcw },
  { to: "/retention", label: "Retention", icon: ShieldCheck },
  { to: "/rewards", label: "Rewards", icon: Gift },
  { to: "/vip", label: "VIP", icon: Crown },
  { to: "/offers", label: "Smart Offers", icon: Sparkles },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const SETTINGS_NAV = [
  { to: "/settings/segmentation", label: "Segmentation Rules", icon: Sliders },
  { to: "/settings/team", label: "Team", icon: UsersRound },
  { to: "/settings/business", label: "Business", icon: Building2 },
  { to: "/settings/billing", label: "Billing", icon: CreditCard },
];

function settingsLinkStyle({ isActive }) {
  return {
    backgroundColor: isActive ? C.greenTint : "transparent",
    color: isActive ? C.greenDeep : C.slate,
  };
}

// Persistent column on desktop (lg+); off-canvas drawer below that,
// toggled by the header's menu button. `open`/`onClose` are ignored at
// lg+ since the drawer transform is overridden back to visible there.
export default function Sidebar({ open, onClose }) {
  const { business, memberships, switchBusiness, signOut } = useAuth();

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
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
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-0.5 px-3 pb-1">
          {SETTINGS_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onClose}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${isActive ? "" : "hover:bg-black/5"}`}
              style={settingsLinkStyle}
            >
              <n.icon size={15} />
              {n.label}
            </NavLink>
          ))}
        </div>

        <button
          onClick={signOut}
          className="mx-3 mb-4 mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-black/5"
          style={{ color: C.slate }}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </aside>
    </>
  );
}
