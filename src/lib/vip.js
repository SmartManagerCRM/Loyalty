// Which VIP tier a customer qualifies for, by spending, from that
// business's own configurable tiers (vip_tiers, seeded by create_business()
// with VIP/Gold/Platinum defaults). Highest-qualifying tier wins.
export function qualifyingTier(totalSpending, tiers) {
  const spending = Number(totalSpending) || 0;
  const sorted = [...(tiers || [])].sort((a, b) => (b.criteria?.min_spending || 0) - (a.criteria?.min_spending || 0));
  return sorted.find((t) => spending >= (Number(t.criteria?.min_spending) || Infinity)) || null;
}

// Per the brief: never default VIPs to a discount. Suggest recognition
// instead, deterministic by tier name so it's not arbitrary.
const TIER_ACTIONS = {
  VIP: { action: "Personal thank-you", detail: "A short personal message acknowledging their loyalty." },
  Gold: { action: "Priority booking", detail: "Skip the queue — offer them first pick of times/slots." },
  Platinum: { action: "Exclusive service / early access", detail: "Give them early access to new services or a free upgrade." },
};

export function vipAction(tierName) {
  return TIER_ACTIONS[tierName] || { action: "Special reward", detail: "Recognize this customer with something beyond a discount." };
}
