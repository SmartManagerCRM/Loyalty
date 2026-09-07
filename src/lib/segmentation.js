// Transparent, rule-based segmentation and Next Best Action.
//
// The heavy lifting (evaluating each business's own configurable
// thresholds) happens in the `customer_segment_flags` SQL view — this file
// only picks one "primary" badge from the boolean flags that view returns,
// and explains WHY a customer got that badge. Nothing here is AI; it's
// meant to be the seam a real scoring model can be swapped in behind later
// (see README "AI / Intelligence").

// Priority order when a customer matches more than one segment.
const PRIORITY = ["lost", "inactive", "at_risk", "due", "vip", "high_value", "frequent", "new", "active"];

const SEGMENT_META = {
  new:        { label: "New",        color: "#4E86B0" },
  active:     { label: "Active",     color: "#1E8A6E" },
  due:        { label: "Due",        color: "#C77D14" },
  inactive:   { label: "Inactive",   color: "#C63B3B" },
  lost:       { label: "Lost",       color: "#7A1F1F" },
  vip:        { label: "VIP",        color: "#B8923A" },
  high_value: { label: "High Value", color: "#146B54" },
  frequent:   { label: "Frequent",   color: "#0E4F5C" },
  at_risk:    { label: "At Risk",    color: "#C77D14" },
};

export function primarySegment(flags) {
  if (!flags) return null;
  const key = PRIORITY.find((k) => flags[`is_${k}`]);
  return key ? { key, ...SEGMENT_META[key] } : null;
}

export function allSegments(flags) {
  if (!flags) return [];
  return PRIORITY.filter((k) => flags[`is_${k}`]).map((key) => ({ key, ...SEGMENT_META[key] }));
}

export function segmentMeta(key) {
  return key ? { key, ...SEGMENT_META[key] } : null;
}

// Rule-based Next Best Action. `flags` is a row from customer_segment_flags,
// `visitLabel` is the business's own word for "visit" (Appointment/Session/…).
export function nextBestAction(flags, { visitLabel = "visit" } = {}) {
  if (!flags) return null;
  const days = flags.days_since_last_visit;
  const cycle = flags.avg_return_cycle_days;

  if (flags.is_lost) {
    return {
      action: "REACTIVATE",
      reason: `Customer has not returned in ${days} days${cycle ? `; their normal return cycle is ${Math.round(cycle)} days.` : "."}`,
      priority: "high",
    };
  }
  if (flags.is_inactive) {
    return {
      action: "REACTIVATE",
      reason: `Customer is ${days} days since their last ${visitLabel.toLowerCase()}${cycle ? `, ${Math.round(days - cycle)} days past their usual ${Math.round(cycle)}-day cycle.` : "."}`,
      priority: "medium",
    };
  }
  if (flags.is_at_risk) {
    return {
      action: "CONTACT CUSTOMER",
      reason: `Return frequency is slipping — ${days} days since last ${visitLabel.toLowerCase()}, longer than their usual ${cycle ? Math.round(cycle) : "?"}-day pattern.`,
      priority: "medium",
    };
  }
  if (flags.is_due) {
    return {
      action: "CONTACT CUSTOMER",
      reason: `Likely due for another ${visitLabel.toLowerCase()} soon — normal cycle is ${cycle ? Math.round(cycle) : "?"} days, currently at ${days} days.`,
      priority: "low",
    };
  }
  if (flags.is_vip) {
    return {
      action: "VIP CARE",
      reason: "Top-tier customer by spending/visits — prioritize service, not discounts.",
      priority: "low",
    };
  }
  if (flags.is_new) {
    return {
      action: "ENCOURAGE SECOND VISIT",
      reason: "Recently joined — a second-visit incentive converts new customers into repeat ones.",
      priority: "low",
    };
  }
  return {
    action: "NO ACTION NEEDED",
    reason: "Customer is active and on a healthy return cycle.",
    priority: "none",
  };
}
