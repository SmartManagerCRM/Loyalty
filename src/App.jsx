import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoadingScreen } from "./components/ui";
import { C } from "./components/theme";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import CustomersList from "./pages/customers/CustomersList";
import CustomerProfile from "./pages/customers/CustomerProfile";
import RecoveryPipeline from "./pages/recovery/RecoveryPipeline";
import Reactivation from "./pages/reactivation/Reactivation";
import Retention from "./pages/retention/Retention";
import SegmentationSettings from "./pages/settings/SegmentationSettings";

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

function AppShell({ children }) {
  return (
    <div className="flex h-screen w-full" style={{ backgroundColor: C.bg }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function Gate() {
  const { supabaseConfigured, ready, session, business } = useAuth();

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

  if (!business) return <Onboarding />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<CustomersList />} />
        <Route path="/customers/:id" element={<CustomerProfile />} />
        <Route path="/recovery" element={<RecoveryPipeline />} />
        <Route path="/reactivation" element={<Reactivation />} />
        <Route path="/retention" element={<Retention />} />
        <Route path="/settings/segmentation" element={<SegmentationSettings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
