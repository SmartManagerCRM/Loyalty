// Points program math. A "points" reward_programs.config looks like:
//   { earn_amount: 10, earn_points: 1, redeem_points: 100, redeem_value: 20 }
// meaning "every `earn_amount` spent earns `earn_points`" and
// "`redeem_points` points = `redeem_value` reward" (spec: "Every SAR 10 = 1
// point", "100 points = SAR 20 reward"). Points aren't stored incrementally
// — they're recomputed from total_spending each time, so there's nothing to
// keep in sync as visits come in. Only *redeemed* points are persisted
// (customer_rewards.redeemed_points), since that's a real event.
export function earnedPoints(totalSpending, program) {
  const { earn_amount, earn_points } = program?.config || {};
  if (!earn_amount || !earn_points) return 0;
  return Math.floor((Number(totalSpending) || 0) / earn_amount) * earn_points;
}

export function pointsBalance(totalSpending, program, redeemedPoints = 0) {
  return Math.max(0, earnedPoints(totalSpending, program) - (Number(redeemedPoints) || 0));
}

export function canRedeem(totalSpending, program, redeemedPoints = 0) {
  const threshold = Number(program?.config?.redeem_points) || Infinity;
  return pointsBalance(totalSpending, program, redeemedPoints) >= threshold;
}

// For "visits" and "spending" milestone programs — how close is this
// customer to the reward.
export function milestoneProgress(row, program) {
  if (program.type === "visits") {
    const required = Number(program.config?.visits_required) || 0;
    return { current: row.total_visits || 0, target: required, met: (row.total_visits || 0) >= required };
  }
  if (program.type === "spending") {
    const required = Number(program.config?.spend_threshold) || 0;
    return { current: Number(row.total_spending) || 0, target: required, met: Number(row.total_spending || 0) >= required };
  }
  return null;
}
