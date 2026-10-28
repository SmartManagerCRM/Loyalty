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

export async function updateBusiness(businessId, { subscriptionPlan, subscriptionStatus, trialEndsAt, billingInterval } = {}) {
  const { error } = await supabase.rpc("admin_update_business", {
    p_business_id: businessId,
    p_subscription_plan: subscriptionPlan ?? null,
    p_subscription_status: subscriptionStatus ?? null,
    p_trial_ends_at: trialEndsAt ?? null,
    p_billing_interval: billingInterval ?? null,
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

// ── Full plan management surface (Admin → Plans) ─────────────────────────

export async function fetchPlansFull() {
  const { data, error } = await supabase.rpc("admin_list_plans_full");
  if (error) throw error;
  return data || [];
}

export async function fetchPlanFeatureCatalog() {
  const { data, error } = await supabase.rpc("admin_list_plan_features");
  if (error) throw error;
  return data || [];
}

export async function upsertPlan(plan) {
  const { data, error } = await supabase.rpc("admin_upsert_plan", {
    p_id: plan.id ?? null,
    p_key: plan.key,
    p_name: plan.name,
    p_description: plan.description ?? null,
    p_short_description: plan.short_description ?? null,
    p_price_monthly: plan.price_monthly === "" ? null : plan.price_monthly,
    p_price_yearly: plan.price_yearly === "" ? null : plan.price_yearly,
    p_currency: plan.currency || "USD",
    p_max_customers: plan.max_customers === "" ? null : plan.max_customers,
    p_location_limit: plan.location_limit === "" ? null : plan.location_limit,
    p_user_limit: plan.user_limit === "" ? null : plan.user_limit,
    p_trial_days: plan.trial_days === "" ? null : plan.trial_days,
    p_badge_text: plan.badge_text || null,
    p_is_featured: !!plan.is_featured,
    p_is_active: !!plan.is_active,
    p_sort_order: plan.sort_order ?? 0,
  });
  if (error) throw error;
  return data;
}

export async function setPlanFeature(planId, featureId, enabled, displayOrder = 0) {
  const { error } = await supabase.rpc("admin_set_plan_feature", {
    p_plan_id: planId, p_feature_id: featureId, p_enabled: enabled, p_display_order: displayOrder,
  });
  if (error) throw error;
}

export async function duplicatePlan(planId) {
  const { data, error } = await supabase.rpc("admin_duplicate_plan", { p_plan_id: planId });
  if (error) throw error;
  return data;
}

export async function reorderPlans(planIds) {
  const { error } = await supabase.rpc("admin_reorder_plans", { p_plan_ids: planIds });
  if (error) throw error;
}

export async function deletePlan(planId) {
  const { error } = await supabase.rpc("admin_delete_plan", { p_plan_id: planId });
  if (error) throw error;
}

export async function updateSubscriptionSettings(freeTrialEnabled, freeTrialDays) {
  const { error } = await supabase.rpc("admin_update_subscription_settings", {
    p_free_trial_enabled: freeTrialEnabled, p_free_trial_days: freeTrialDays,
  });
  if (error) throw error;
}
