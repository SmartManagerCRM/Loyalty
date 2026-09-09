import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useIsPlatformAdmin } from "../lib/useIsPlatformAdmin";
import { LoadingScreen, Btn } from "../components/ui";
import { C } from "../components/theme";
import AdminLogin from "./AdminLogin";
import AdminShell from "./AdminShell";
import Overview from "./pages/Overview";
import Businesses from "./pages/Businesses";
import BusinessDetail from "./pages/BusinessDetail";
import Subscriptions from "./pages/Subscriptions";
import Plans from "./pages/Plans";
import Payments from "./pages/Payments";
import Trials from "./pages/Trials";

function SetupNotice() {
  return (
    <div className="flex h-screen w-full items-center justify-center px-4 text-center" style={{ backgroundColor: C.bg }}>
      <p className="text-sm font-semibold" style={{ color: C.ink }}>Supabase is not configured.</p>
    </div>
  );
}

function AccessDenied() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 px-4 text-center" style={{ backgroundColor: C.bg }}>
      <ShieldAlert size={40} style={{ color: C.red }} />
      <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("admin.common.accessDeniedTitle")}</h1>
      <p className="max-w-sm text-sm" style={{ color: C.slateLight }}>{t("admin.common.accessDeniedBody")}</p>
      <div className="mt-2 flex gap-2">
        <a href="/"><Btn variant="secondary">{t("admin.common.backToApp")}</Btn></a>
        <Btn variant="ghost" onClick={signOut}>{t("common.signOut")}</Btn>
      </div>
    </div>
  );
}

// Entirely separate authorization dimension from tenant business
// membership (see supabase/schema.sql "Platform Admin"): a signed-in user
// with no business at all can still be a platform admin, and a business
// owner/admin has zero admin access here by default. Mounted at /admin/*
// from App.jsx, before the tenant Gate ever sees the request.
export default function AdminGate() {
  const { supabaseConfigured, ready, session, user, signOut } = useAuth();
  const { isAdmin, checked } = useIsPlatformAdmin(user?.id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!supabaseConfigured) return <SetupNotice />;
  if (!ready) return <LoadingScreen />;

  if (!session) {
    return (
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    );
  }

  if (!checked) return <LoadingScreen />;
  if (!isAdmin) return <AccessDenied />;

  // Relative paths here on purpose: this <Routes> is nested inside a
  // splat-matched parent (App.jsx's <Route path="/admin/*">), and mixing
  // that with absolute child paths is a known React Router v6 footgun —
  // it can silently fail to match anything (see the "relative route
  // resolution within Splat routes" warning). Relative paths are the
  // pattern React Router actually supports for this nesting.
  return (
    <AdminShell mobileNavOpen={mobileNavOpen} onOpenMobileMenu={() => setMobileNavOpen(true)} onCloseMobileMenu={() => setMobileNavOpen(false)} onSignOut={signOut}>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="businesses" element={<Businesses />} />
        <Route path="businesses/:id" element={<BusinessDetail />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="plans" element={<Plans />} />
        <Route path="payments" element={<Payments />} />
        <Route path="trials" element={<Trials />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminShell>
  );
}
