import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Target, RotateCcw, ShieldCheck, Sliders, Stethoscope, LogOut } from "lucide-react";
import { C } from "./theme";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/recovery", label: "Recovery", icon: Target },
  { to: "/reactivation", label: "Reactivation", icon: RotateCcw },
  { to: "/retention", label: "Retention", icon: ShieldCheck },
];

const SETTINGS_NAV = { to: "/settings/segmentation", label: "Segmentation Rules", icon: Sliders };

export default function Sidebar() {
  const { business, signOut } = useAuth();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r" style={{ borderColor: C.border, backgroundColor: C.white }}>
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: C.green }}>
          <Stethoscope size={18} color="#fff" />
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: C.ink }}>SmartManager</div>
          <div className="text-xs" style={{ color: C.slateLight }}>Loyalty</div>
        </div>
      </div>

      {business && (
        <div className="mx-3 mb-2 rounded-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: C.greenTint, color: C.greenDeep }}>
          {business.name}
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
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

      <div className="px-3 pb-1">
        <NavLink
          to={SETTINGS_NAV.to}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? "" : "hover:bg-black/5"}`
          }
          style={({ isActive }) => ({
            backgroundColor: isActive ? C.greenTint : "transparent",
            color: isActive ? C.greenDeep : C.slate,
          })}
        >
          <SETTINGS_NAV.icon size={17} />
          {SETTINGS_NAV.label}
        </NavLink>
      </div>

      <button
        onClick={signOut}
        className="mx-3 mb-4 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-black/5"
        style={{ color: C.slate }}
      >
        <LogOut size={17} />
        Sign out
      </button>
    </aside>
  );
}
