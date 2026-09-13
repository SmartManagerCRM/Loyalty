import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AdminGate from "./admin/AdminGate";
import { LoadingScreen, Btn } from "./components/ui";
import { C } from "./components/theme";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Pricing from "./pages/Pricing";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import CustomersList from "./pages/customers/CustomersList";
import CustomerProfile from "./pages/customers/CustomerProfile";
import Bookings from "./pages/bookings/Bookings";
import Memberships from "./pages/memberships/Memberships";
import RecoveryPipeline from "./pages/recovery/RecoveryPipeline";
import Reactivation from "./pages/reactivation/Reactivation";
import Retention from "./pages/retention/Retention";
import Rewards from "./pages/rewards/Rewards";
import VIP from "./pages/vip/VIP";
import Offers from "./pages/offers/Offers";
import Analytics from "./pages/analytics/Analytics";
import Settings from "./pages/settings/Settings";

// Dev/ops configuration error, shown before any business or language
// context exists — deliberately left untranslated (it's read by the
// developer deploying the app, not an end-user customer).
function SetupNotice() {
  return (
    <div className="flex h-screen w-full items-center justify-center px-4 text-center" style={{ backgroundColor: C.bg }}>
      <div>
        <p className="text-sm font-semibold" style={{ color: C.ink }}>Supabase is not configured.</p>
        <p className="mt-1 text-xs" style={{ color: C.slateLight }}>
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your <code>.env</code> file.
        </p>
      </div>
    </div>
  );
}

// Shown when we're signed in but failed to load your business membership
// (a network error, not "you have no business yet") — without this, Gate()
// would fall through to <Onboarding/>, which risks creating a duplicate
// business for an account that already has one.
function AccountLoadError({ message }) {
  const { t } = useTranslation();
  const { refreshBusiness, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    await refreshBusiness();
    setRetrying(false);
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 px-4 text-center" style={{ backgroundColor: C.bg }}>
      <AlertCircle size={36} style={{ color: C.red }} />
      <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.loadError.title")}</h1>
      <p className="max-w-sm text-sm" style={{ color: C.slateLight }}>{message || t("auth.loadError.body")}</p>
      <div className="mt-2 flex gap-2">
        <Btn onClick={handleRetry} disabled={retrying}>{retrying ? t("common.loading") : t("auth.loadError.retry")}</Btn>
        <Btn variant="ghost" onClick={signOut}>{t("common.signOut")}</Btn>
      </div>
    </div>
  );
}

function AppShell({ children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen w-full" style={{ backgroundColor: C.bg }}>
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMobileMenu={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function Gate() {
  const { supabaseConfigured, ready, session, business, membershipsLoaded, error } = useAuth();

  if (!supabaseConfigured) return <SetupNotice />;
  if (!ready) return <LoadingScreen />;

  if (!session) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Distinct from "no business yet": membershipsLoaded only turns true once
  // the check has actually completed (success or failure), so a network
  // error here can't be mistaken for a genuinely new account and silently
  // fall through to the onboarding wizard.
  if (!membershipsLoaded) return <LoadingScreen />;
  if (error && !business) return <AccountLoadError message={error} />;
  if (!business) return <Onboarding />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<CustomersList />} />
        <Route path="/customers/:id" element={<CustomerProfile />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/memberships" element={<Memberships />} />
        <Route path="/recovery" element={<RecoveryPipeline />} />
        <Route path="/reactivation" element={<Reactivation />} />
        <Route path="/retention" element={<Retention />} />
        <Route path="/rewards" element={<Rewards />} />
        <Route path="/vip" element={<VIP />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/segmentation" element={<Navigate to="/settings?tab=segmentation" replace />} />
        <Route path="/settings/team" element={<Navigate to="/settings?tab=team" replace />} />
        <Route path="/settings/business" element={<Navigate to="/settings?tab=business" replace />} />
        <Route path="/settings/billing" element={<Navigate to="/settings?tab=billing" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/admin/*" element={<AdminGate />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/*" element={<Gate />} />
      </Routes>
    </AuthProvider>
  );
}
