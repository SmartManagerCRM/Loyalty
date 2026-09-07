import i18n from "./i18n";

// Transparent, rule-based segmentation and Next Best Action.
//
// The heavy lifting (evaluating each business's own configurable
// thresholds) happens in the `customer_segment_flags` SQL view — this file
// only picks one "primary" badge from the boolean flags that view returns,
// and explains WHY a customer got that badge. Nothing here is AI; it's
// meant to be the seam a real scoring model can be swapped in behind later
// (see README "AI / Intelligence").
//
// This is a plain JS module (not a React component), so it reads the
// i18next singleton directly rather than the useTranslation() hook.
// Callers that memoize results derived from these functions should include
// i18n.language in their dependency array so switching language recomputes
// the displayed text.

// Priority order when a customer matches more than one segment.
const PRIORITY = ["lost", "inactive", "at_risk", "due", "vip", "high_value", "frequent", "new", "active"];

const SEGMENT_COLOR = {
  new: "#4E86B0",
  active: "#1E8A6E",
  due: "#C77D14",
  inactive: "#C63B3B",
  lost: "#7A1F1F",
  vip: "#B8923A",
  high_value: "#146B54",
  frequent: "#0E4F5C",
  at_risk: "#C77D14",
};

export function primarySegment(flags) {
  if (!flags) return null;
  const key = PRIORITY.find((k) => flags[`is_${k}`]);
  return key ? { key, label: i18n.t(`segments.${key}`), color: SEGMENT_COLOR[key] } : null;
}

export function allSegments(flags) {
  if (!flags) return [];
  return PRIORITY.filter((k) => flags[`is_${k}`]).map((key) => ({ key, label: i18n.t(`segments.${key}`), color: SEGMENT_COLOR[key] }));
}

export function segmentMeta(key) {
  return key ? { key, label: i18n.t(`segments.${key}`), color: SEGMENT_COLOR[key] } : null;
}

// Rule-based Next Best Action. `flags` is a row from customer_segment_flags,
// `visitLabel` is the business's own word for "visit" (Appointment/Session/…).
export function nextBestAction(flags, { visitLabel = "visit" } = {}) {
  if (!flags) return null;
  const days = flags.days_since_last_visit;
  const cycle = flags.avg_return_cycle_days;
  const t = i18n.t;
  const lowerVisitLabel = visitLabel.toLowerCase();

  if (flags.is_lost) {
    return {
      action: t("nextBestAction.actions.reactivate"),
      reason: cycle
        ? t("nextBestAction.reasons.lostWithCycle", { days, cycle: Math.round(cycle) })
        : t("nextBestAction.reasons.lostNoCycle", { days }),
      priority: "high",
    };
  }
  if (flags.is_inactive) {
    return {
      action: t("nextBestAction.actions.reactivate"),
      reason: cycle
        ? t("nextBestAction.reasons.inactiveWithCycle", { days, visitLabel: lowerVisitLabel, overdue: Math.round(days - cycle), cycle: Math.round(cycle) })
        : t("nextBestAction.reasons.inactiveNoCycle", { days, visitLabel: lowerVisitLabel }),
      priority: "medium",
    };
  }
  if (flags.is_at_risk) {
    return {
      action: t("nextBestAction.actions.contactCustomer"),
      reason: t("nextBestAction.reasons.atRisk", { days, visitLabel: lowerVisitLabel, cycle: cycle ? Math.round(cycle) : t("nextBestAction.reasons.atRiskUnknownCycle") }),
      priority: "medium",
    };
  }
  if (flags.is_due) {
    return {
      action: t("nextBestAction.actions.contactCustomer"),
      reason: t("nextBestAction.reasons.due", { visitLabel: lowerVisitLabel, cycle: cycle ? Math.round(cycle) : t("nextBestAction.reasons.atRiskUnknownCycle"), days }),
      priority: "low",
    };
  }
  if (flags.is_vip) {
    return {
      action: t("nextBestAction.actions.vipCare"),
      reason: t("nextBestAction.reasons.vip"),
      priority: "low",
    };
  }
  if (flags.is_new) {
    return {
      action: t("nextBestAction.actions.encourageSecondVisit"),
      reason: t("nextBestAction.reasons.new"),
      priority: "low",
    };
  }
  return {
    action: t("nextBestAction.actions.noActionNeeded"),
    reason: t("nextBestAction.reasons.default"),
    priority: "none",
  };
}

// "Advanced scoring" (Phase 4) — still fully transparent and rule-based, on
// purpose (see README "AI / Intelligence"): a 0-100 churn risk score built
// from two named, visible components so staff can see exactly why a
// customer scored the way they did. This is the seam a real model would
// slot into later without changing anything that reads `.score`.
export function churnRiskScore(flags) {
  if (!flags) return null;
  const { days_since_last_visit: days, avg_return_cycle_days: cycle } = flags;
  const overdueRatio = cycle && days != null ? days / cycle : null;
  const t = i18n.t;

  // 0-60: how far past their own normal cycle they are (0 if on time/early).
  const overdueComponent = overdueRatio != null
    ? Math.round(Math.min(60, Math.max(0, (overdueRatio - 1) * 60)))
    : 0;
  // 0-40: how severe their current segment already is.
  const segmentComponent = flags.is_lost ? 40 : flags.is_inactive ? 25 : flags.is_at_risk ? 15 : flags.is_due ? 5 : 0;

  const score = Math.min(100, overdueComponent + segmentComponent);
  const breakdown = [
    {
      label: overdueRatio != null
        ? t("churnRisk.overdueWithCycle", { pct: Math.round((overdueRatio - 1) * 100), cycle: Math.round(cycle) })
        : t("churnRisk.overdueNoHistory"),
      value: overdueComponent,
    },
    { label: t("churnRisk.segmentSeverity", { segment: primarySegment(flags)?.label || t("segments.active") }), value: segmentComponent },
  ];
  return { score, breakdown };
}
