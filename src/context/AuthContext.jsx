import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

const AuthContext = createContext(null);
const LAST_BUSINESS_KEY = "smartmanager-loyalty:last-business-id";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [memberships, setMemberships] = useState([]); // [{ role, businesses: {...} }]
  const [businessId, setBusinessId] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const loadMemberships = useCallback(async (userId) => {
    if (!userId) { setMemberships([]); setBusinessId(null); return; }

    // Join anything this email was invited to before their account existed.
    await supabase.rpc("claim_invites");

    const { data, error } = await supabase
      .from("business_users")
      .select("role, businesses(*)")
      .eq("user_id", userId);
    if (error) { setError(error.message); return; }

    const list = data || [];
    setMemberships(list);

    let saved = null;
    try { saved = window.localStorage.getItem(LAST_BUSINESS_KEY); } catch (e) { /* ignore */ }
    const stillMember = saved && list.some((m) => m.businesses?.id === saved);
    setBusinessId(stillMember ? saved : list[0]?.businesses?.id || null);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) { setReady(true); return; }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) await loadMemberships(data.session.user.id);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) await loadMemberships(newSession.user.id);
      else { setMemberships([]); setBusinessId(null); }
    });

    return () => listener?.subscription?.unsubscribe();
  }, [loadMemberships]);

  const switchBusiness = useCallback((id) => {
    setBusinessId(id);
    try { window.localStorage.setItem(LAST_BUSINESS_KEY, id); } catch (e) { /* ignore */ }
  }, []);

  const createBusiness = useCallback(async (params) => {
    const { data, error } = await supabase.rpc("create_business", {
      p_name: params.name,
      p_business_type: params.businessType || "other",
      p_visit_label: params.visitLabel || "Visit",
      p_language: params.language || "en",
      p_currency: params.currency || "SAR",
    });
    if (error) throw error;
    await loadMemberships(session?.user?.id);
    switchBusiness(data);
    return data;
  }, [loadMemberships, session, switchBusiness]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMemberships([]);
    setBusinessId(null);
  }, []);

  const current = memberships.find((m) => m.businesses?.id === businessId) || memberships[0] || null;

  const value = {
    supabaseConfigured,
    session,
    user: session?.user || null,
    memberships,
    business: current?.businesses || null,
    role: current?.role || null,
    switchBusiness,
    ready,
    error,
    createBusiness,
    signOut,
    refreshBusiness: () => loadMemberships(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
