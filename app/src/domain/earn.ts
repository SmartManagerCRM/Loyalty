import type { EarnRule } from "./settings";

/** Points for a purchase under the rule. Integer-only arithmetic; floors. */
export function computeEarnedPoints(amountMinor: number, rule: EarnRule, tierMultiplierPct = 100): number {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) throw new Error("amount must be a non-negative integer");
  if (amountMinor < rule.minPurchaseMinor) return 0;
  const spendPoints = rule.perAmountMinor > 0 ? Math.floor(amountMinor / rule.perAmountMinor) * rule.points : 0;
  const base = spendPoints + rule.perVisitBonus;
  return Math.floor((base * tierMultiplierPct) / 100);
}

export function validateEarnRule(r: EarnRule): string | null {
  const ints = [r.perAmountMinor, r.points, r.perVisitBonus, r.minPurchaseMinor];
  if (ints.some((n) => !Number.isInteger(n) || n < 0)) return "invalid_number";
  if (r.perAmountMinor === 0 && r.perVisitBonus === 0) return "rule_earns_nothing";
  if (r.perAmountMinor > 0 && r.points === 0 && r.perVisitBonus === 0) return "rule_earns_nothing";
  return null;
}
