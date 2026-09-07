import i18n from "./i18n";

// Minimal "smart offer" suggestion — picks an offer type from a customer's
// segment flags and explains why. This is the lightweight version used by
// Reactivation/Retention/Recovery message generation in Phase 2; the full
// Smart Offers module (configurable offers, tracked recommendations) is
// Phase 3 and lives in the `offers`/`offer_recommendations` tables already
// present in supabase/schema.sql.
//
// Plain JS module — reads the i18next singleton directly (see
// segmentation.js for the same pattern and its caveat about memoization).
export function suggestOffer(flags) {
  if (!flags) return null;
  const t = i18n.t;
  if (flags.is_vip) {
    return { text: t("offerEngine.vip.text"), reason: t("offerEngine.vip.reason") };
  }
  if (flags.is_lost) {
    return { text: t("offerEngine.lost.text"), reason: t("offerEngine.lost.reason") };
  }
  if (flags.is_inactive || flags.is_at_risk) {
    return { text: t("offerEngine.inactiveAtRisk.text"), reason: t("offerEngine.inactiveAtRisk.reason") };
  }
  if (flags.is_new) {
    return { text: t("offerEngine.new.text"), reason: t("offerEngine.new.reason") };
  }
  if (flags.is_frequent) {
    return { text: t("offerEngine.frequent.text"), reason: t("offerEngine.frequent.reason") };
  }
  return null;
}
