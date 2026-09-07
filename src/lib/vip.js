import i18n from "./i18n";

// Which VIP tier a customer qualifies for, by spending, from that
// business's own configurable tiers (vip_tiers, seeded by create_business()
// with VIP/Gold/Platinum defaults). Highest-qualifying tier wins.
export function qualifyingTier(totalSpending, tiers) {
  const spending = Number(totalSpending) || 0;
  const sorted = [...(tiers || [])].sort((a, b) => (b.criteria?.min_spending || 0) - (a.criteria?.min_spending || 0));
  return sorted.find((t) => spending >= (Number(t.criteria?.min_spending) || Infinity)) || null;
}

// Per the brief: never default VIPs to a discount. Suggest recognition
// instead, deterministic by tier name so it's not arbitrary. Translated
// text is keyed by the seeded default tier names (VIP/Gold/Platinum) — a
// business that renames its tiers falls back to a generic recognition
// action, same as before.
export function vipAction(tierName) {
  const t = i18n.t;
  if (tierName && ["VIP", "Gold", "Platinum"].includes(tierName)) {
    return { action: t(`vipTierActions.${tierName}.action`), detail: t(`vipTierActions.${tierName}.detail`) };
  }
  return { action: t("vipTierActions.default.action"), detail: t("vipTierActions.default.detail") };
}
