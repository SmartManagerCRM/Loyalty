import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "../context/AuthContext";

// Single source of truth for "annual = X months free / save $Y" — both the
// public pricing page and the Admin plan editor's live preview call this
// instead of hard-coding a savings percentage anywhere.
export function computeAnnualSavings(monthly, yearly) {
  if (monthly == null || yearly == null) return null;
  const fullYear = Number(monthly) * 12;
  const amount = fullYear - Number(yearly);
  if (!Number.isFinite(amount) || fullYear <= 0) return null;
  const pct = Math.round((amount / fullYear) * 100);
  const monthsFree = Math.round((amount / Number(monthly)) * 10) / 10;
  return { amount, pct, monthsFree };
}

// Public, unauthenticated: what /pricing renders. Never hard-code plan
// data in a component — this is the one place that reads it.
export async function fetchPublicPlans() {
  const { data, error } = await supabase.rpc("list_public_plans");
  if (error) throw error;
  return data || [];
}

export async function fetchSubscriptionSettings() {
  const { data, error } = await supabase.rpc("get_subscription_settings");
  if (error) throw error;
  return data?.[0] || { free_trial_enabled: true, free_trial_days: 14 };
}

// Tenant-side: which feature keys does the signed-in business's active
// plan include. Every feature gate in the app (VIP, Smart Offers,
// Memberships, …) reads from this one hook instead of re-deriving plan
// logic per page.
export function usePlanFeatures() {
  const { business } = useAuth();
  const [features, setFeatures] = useState(null); // null = loading
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!business?.id) { setFeatures(new Set()); setReady(true); return; }
    let cancelled = false;
    setReady(false);
    supabase.rpc("my_plan_features").then(({ data, error }) => {
      if (cancelled) return;
      setFeatures(new Set(error ? [] : (data || []).map((r) => r.key)));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [business?.id, business?.subscription_plan]);

  return {
    ready,
    features: features || new Set(),
    hasFeature: (key) => (features || new Set()).has(key),
  };
}
