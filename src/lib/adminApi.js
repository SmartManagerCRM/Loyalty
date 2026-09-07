import { supabase } from "./supabaseClient";

// Thin wrappers over the admin_* security-definer RPC functions (see
// supabase/schema.sql "Admin RPC surface"). Every one of these is a no-op
// (empty result / thrown error) for a non-platform-admin caller — the
// database enforces that, not this file — so there's nothing extra to
// guard client-side here.

export async function fetchOverviewStats() {
  const { data, error } = await supabase.rpc("admin_overview_stats");
  if (error) throw error;
  return data?.[0] || null;
}

export async function fetchBusinesses() {
  const { data, error } = await supabase.rpc("admin_list_businesses");
  if (error) throw error;
  return data || [];
}

export async function fetchBusiness(businessId) {
  const { data, error } = await supabase.rpc("admin_get_business", { p_business_id: businessId });
  if (error) throw error;
  return data?.[0] || null;
}

export async function fetchBusinessMembers(businessId) {
  const { data, error } = await supabase.rpc("admin_list_business_members", { p_business_id: businessId });
  if (error) throw error;
  return data || [];
}

export async function updateBusiness(businessId, { subscriptionPlan, subscriptionStatus, trialEndsAt } = {}) {
  const { error } = await supabase.rpc("admin_update_business", {
    p_business_id: businessId,
    p_subscription_plan: subscriptionPlan ?? null,
    p_subscription_status: subscriptionStatus ?? null,
    p_trial_ends_at: trialEndsAt ?? null,
  });
  if (error) throw error;
}

export async function fetchPayments(businessId = null) {
  const { data, error } = await supabase.rpc("admin_list_payments", { p_business_id: businessId });
  if (error) throw error;
  return data || [];
}

export async function recordPayment({ businessId, amount, currency = "USD", planId = null, periodStart = null, periodEnd = null, notes = null }) {
  const { data, error } = await supabase.rpc("admin_record_payment", {
    p_business_id: businessId,
    p_amount: amount,
    p_currency: currency,
    p_plan_id: planId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_notes: notes,
  });
  if (error) throw error;
  return data;
}

// Plans are a plain table (RLS-gated, see schema) rather than an RPC
// surface, since reads are needed by the tenant Billing page too.
export async function fetchPlans({ includeInactive = false } = {}) {
  let query = supabase.from("plans").select("*").order("sort_order", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createPlan(plan) {
  const { error } = await supabase.from("plans").insert(plan);
  if (error) throw error;
}

export async function updatePlan(id, plan) {
  const { error } = await supabase.from("plans").update(plan).eq("id", id);
  if (error) throw error;
}
