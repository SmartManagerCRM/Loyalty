import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { withTimeout } from "../lib/withTimeout";

const AuthContext = createContext(null);
const LAST_BUSINESS_KEY = "smartmanager-loyalty:last-business-id";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [memberships, setMemberships] = useState([]); // [{ role, businesses: {...} }]
  const [businessId, setBusinessId] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  // Distinguishes "haven't checked your business yet (or the check failed)"
  // from "checked, and you genuinely have none" — without this, any thrown
  // error (a network hiccup, a broken connection) looks identical to a
  // brand-new account and silently routes into the onboarding wizard instead
  // of showing a retry. See Gate() in App.jsx, which reads this alongside
  // `error` to tell the two apart.
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);

  const loadMemberships = useCallback(async (userId) => {
    if (!userId) { setMemberships([]); setBusinessId(null); setMembershipsLoaded(true); return; }

    try {
      // Join anything this email was invited to before their account existed.
      await withTimeout(supabase.rpc("claim_invites"));

      const { data, error } = await withTimeout(supabase
        .from("business_users")
        .select("role, businesses(*)")
        .eq("user_id", userId));
      if (error) { setError(error.message); return; }

      const list = data || [];
      setMemberships(list);

      let saved = null;
      try { saved = window.localStorage.getItem(LAST_BUSINESS_KEY); } catch (e) { /* ignore */ }
      const stillMember = saved && list.some((m) => m.businesses?.id === saved);
      setBusinessId(stillMember ? saved : list[0]?.businesses?.id || null);
      setError(null);
    } catch (err) {
      // A thrown (not just Postgrest-returned) error — e.g. the network
      // request itself failing — must still be caught here: left unhandled,
      // it would silently skip every setState below and leave the account
      // looking exactly like a brand-new signup with no business yet.
      setError(err.message || "Couldn't load your account. Check your connection and try again.");
    } finally {
      setMembershipsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) { setReady(true); return; }

    withTimeout(supabase.auth.getSession()).then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) await loadMemberships(data.session.user.id);
      setReady(true);
    }).catch((err) => {
      // Without this catch, a thrown error here (rather than one Supabase
      // returns normally) would skip setReady(true) entirely, leaving the
      // app on its loading screen forever.
      setError(err.message || "Couldn't load your session. Check your connection and try again.");
      setReady(true);
    });

    // Supabase explicitly warns against awaiting async work directly inside
    // this callback: a token refresh awaits this callback before it considers
    // itself done, so calling back into supabase.rpc()/.from() in here can
    // deadlock the refresh against itself. Deferring with setTimeout lets the
    // callback return immediately and breaks that cycle.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setTimeout(() => {
        if (newSession?.user?.id) loadMemberships(newSession.user.id);
        else { setMemberships([]); setBusinessId(null); setMembershipsLoaded(true); }
      }, 0);
    });

    return () => listener?.subscription?.unsubscribe();
  }, [loadMemberships]);

  const switchBusiness = useCallback((id) => {
    setBusinessId(id);
    try { window.localStorage.setItem(LAST_BUSINESS_KEY, id); } catch (e) { /* ignore */ }
  }, []);

  const createBusiness = useCallback(async (params) => {
    const { data, error } = await withTimeout(supabase.rpc("create_business", {
      p_name: params.name,
      p_plan_id: params.planId,
      p_billing_interval: params.billingInterval || "monthly",
      p_business_type: params.businessType || "other",
      p_visit_label: params.visitLabel || "Visit",
      p_language: params.language || "en",
      p_currency: params.currency || "SAR",
    }));
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
    membershipsLoaded,
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
