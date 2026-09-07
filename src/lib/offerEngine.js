// Minimal "smart offer" suggestion — picks an offer type from a customer's
// segment flags and explains why. This is the lightweight version used by
// Reactivation/Retention/Recovery message generation in Phase 2; the full
// Smart Offers module (configurable offers, tracked recommendations) is
// Phase 3 and lives in the `offers`/`offer_recommendations` tables already
// present in supabase/schema.sql.
export function suggestOffer(flags) {
  if (!flags) return null;
  if (flags.is_vip) {
    return { text: "an exclusive VIP benefit (priority booking, not a discount)", reason: "VIP customers respond better to recognition than discounts." };
  }
  if (flags.is_lost) {
    return { text: "a 15% comeback offer", reason: "Long-lapsed customers usually need a stronger incentive to return." };
  }
  if (flags.is_inactive || flags.is_at_risk) {
    return { text: "a 10% return offer", reason: "A modest nudge is usually enough for a recently-lapsed customer." };
  }
  if (flags.is_new) {
    return { text: "a second-visit incentive", reason: "Converting a first-time customer into a second visit is the highest-leverage moment." };
  }
  if (flags.is_frequent) {
    return { text: "a loyalty reward", reason: "Frequent customers are already engaged — reward the behavior, don't discount it." };
  }
  return null;
}
