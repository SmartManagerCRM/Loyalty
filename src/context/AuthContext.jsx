import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [business, setBusiness] = useState(null);
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const loadBusiness = useCallback(async (userId) => {
    if (!userId) { setBusiness(null); setRole(null); return; }
    const { data, error } = await supabase
      .from("business_users")
      .select("role, businesses(*)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error) { setError(error.message); return; }
    setBusiness(data?.businesses || null);
    setRole(data?.role || null);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) { setReady(true); return; }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) await loadBusiness(data.session.user.id);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) await loadBusiness(newSession.user.id);
      else setBusiness(null);
    });

    return () => listener?.subscription?.unsubscribe();
  }, [loadBusiness]);

  const createBusiness = useCallback(async (params) => {
    const { data, error } = await supabase.rpc("create_business", {
      p_name: params.name,
      p_business_type: params.businessType || "other",
      p_visit_label: params.visitLabel || "Visit",
      p_language: params.language || "en",
      p_currency: params.currency || "SAR",
    });
    if (error) throw error;
    await loadBusiness(session?.user?.id);
    return data;
  }, [loadBusiness, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setBusiness(null);
    setRole(null);
  }, []);

  const value = {
    supabaseConfigured,
    session,
    user: session?.user || null,
    business,
    role,
    ready,
    error,
    createBusiness,
    signOut,
    refreshBusiness: () => loadBusiness(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
