import { addDays, dayDiff, daysUntilBirthday, localDate } from "./dates";
import type { ScoringSettings } from "./settings";
import type { ActionType, Band, Consent, Reason, SegmentRules } from "./types";

/** Raw facts for one customer, loaded from the database. */
export interface CustomerFacts {
  id: string;
  name: string;
  createdAt: string;
  birthday: string | null;
  consent: Consent;
  hasPhone: boolean;
  tags: string[];
  /** ISO instants of active purchases (any order). */
  purchaseAts: string[];
  spendMinor: number;
  pointsBalance: number;
  tierId: string | null;
  tierName: string | null;
  /** latest time we prepared/contacted this customer in any Smart Action */
  lastContactAt: string | null;
  /** earliest due date of an open follow-up, if any */
  nextFollowUpOn: string | null;
  /** unredeemed rewards the customer can afford now (id, name, cost), cheapest first */
  affordableRewards: { id: string; name: string; cost: number }[];
}

export interface CustomerInsight extends CustomerFacts {
  visitCount: number;
  firstVisitOn: string | null;
  lastVisitOn: string | null;
  daysSinceLast: number | null;
  daysSinceFirst: number | null;
  usualIntervalDays: number | null;
  effectiveIntervalDays: number;
  intervalFromHistory: boolean;
  atRiskAfterDays: number;
  winBackAfterDays: number;
  recent90: number;
  prior90: number;
  frequencyDeclined: boolean;
  band: Band;
  isVip: boolean;
  rewardReady: boolean;
  daysSinceContact: number | null;
  followUpDue: boolean;
  birthdayInDays: number | null;
  contactable: boolean;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function computeInsight(f: CustomerFacts, cfg: ScoringSettings, now: Date): CustomerInsight {
  const today = localDate(now);
  const visitDays = Array.from(new Set(f.purchaseAts.map((a) => localDate(a)))).sort();
  const visitCount = visitDays.length;
  const firstVisitOn = visitDays[0] ?? null;
  const lastVisitOn = visitDays[visitDays.length - 1] ?? null;
  const daysSinceLast = lastVisitOn ? Math.max(0, dayDiff(lastVisitOn, today)) : null;
  const daysSinceFirst = firstVisitOn ? Math.max(0, dayDiff(firstVisitOn, today)) : null;

  let usual: number | null = null;
  if (visitCount >= 3) {
    const gaps: number[] = [];
    for (let i = Math.max(1, visitDays.length - 6); i < visitDays.length; i++) gaps.push(dayDiff(visitDays[i - 1]!, visitDays[i]!));
    usual = Math.max(1, Math.round(median(gaps)));
  }
  const effective = usual ?? cfg.defaultIntervalDays;
  const atRiskAfter = Math.max(Math.round((effective * cfg.atRiskPct) / 100), cfg.atRiskMinDays);
  const winBackAfter = Math.max(Math.round((effective * cfg.winBackPct) / 100), cfg.winBackMinDays, atRiskAfter + 1);

  const d90 = addDays(today, -90);
  const d180 = addDays(today, -180);
  const recent90 = visitDays.filter((d) => d > d90).length;
  const prior90 = visitDays.filter((d) => d > d180 && d <= d90).length;
  const frequencyDeclined = prior90 >= cfg.declineMinPriorVisits && recent90 * 100 < prior90 * cfg.declineRatioPct;

  let band: Band;
  if (visitCount === 0) {
    const age = Math.max(0, dayDiff(localDate(f.createdAt), today));
    band = age >= cfg.newWindowDays ? "no_purchases" : "new";
  } else if (visitCount === 1 && (daysSinceLast ?? 0) <= cfg.newWindowDays) {
    band = "new";
  } else if ((daysSinceLast ?? 0) >= winBackAfter) {
    band = "inactive";
  } else if ((daysSinceLast ?? 0) >= atRiskAfter) {
    band = "at_risk";
  } else {
    band = "active";
  }

  const daysSinceContact = f.lastContactAt ? Math.max(0, dayDiff(localDate(f.lastContactAt), today)) : null;
  return {
    ...f,
    visitCount,
    firstVisitOn,
    lastVisitOn,
    daysSinceLast,
    daysSinceFirst,
    usualIntervalDays: usual,
    effectiveIntervalDays: effective,
    intervalFromHistory: usual !== null,
    atRiskAfterDays: atRiskAfter,
    winBackAfterDays: winBackAfter,
    recent90,
    prior90,
    frequencyDeclined,
    band,
    isVip: f.tierId !== null,
    rewardReady: f.affordableRewards.length > 0,
    daysSinceContact,
    followUpDue: f.nextFollowUpOn !== null && f.nextFollowUpOn <= today,
    birthdayInDays: daysUntilBirthday(f.birthday, today),
    contactable: f.consent !== "do_not_contact",
  };
}

export interface Candidate {
  customerId: string;
  priority: number; // 0-100, transparent sum of named parts
  reasons: Reason[];
  /** Soft flags shown in UI. Recently contacted customers are not preselected. */
  recentlyContacted: boolean;
  blocked: "do_not_contact" | null;
}

function silenceReason(i: CustomerInsight): Reason {
  return i.intervalFromHistory
    ? { key: "noPurchaseUsual", params: { days: i.daysSinceLast ?? 0, interval: i.effectiveIntervalDays } }
    : { key: "noPurchaseDefault", params: { days: i.daysSinceLast ?? 0, interval: i.effectiveIntervalDays } };
}

/** Transparent priority: recency overshoot (0-50) + value (0-25) + VIP (15) + reward ready (10). */
export function priorityScore(i: CustomerInsight): number {
  const overshoot = i.daysSinceLast === null ? 0 : Math.min(50, Math.round((i.daysSinceLast / Math.max(1, i.effectiveIntervalDays)) * 12));
  const value = Math.min(25, Math.round(Math.log10(1 + i.spendMinor / 100) * 7));
  return Math.min(100, overshoot + value + (i.isVip ? 15 : 0) + (i.rewardReady ? 10 : 0));
}

function baseCandidate(i: CustomerInsight, cfg: ScoringSettings, reasons: Reason[]): Candidate {
  if (i.isVip && i.tierName) reasons.push({ key: "vipTier", params: { tier: i.tierName } });
  if (i.rewardReady) reasons.push({ key: "rewardReady", params: { reward: i.affordableRewards[0]!.name, points: i.pointsBalance } });
  if (i.daysSinceContact !== null) reasons.push({ key: "lastContacted", params: { days: i.daysSinceContact } });
  return {
    customerId: i.id,
    priority: priorityScore(i),
    reasons,
    recentlyContacted: i.daysSinceContact !== null && i.daysSinceContact < cfg.cooldownDays,
    blocked: i.contactable ? null : "do_not_contact",
  };
}

/** Which customers belong in each guided workflow, and why. `custom` uses a saved segment. */
export function evaluateEligibility(type: ActionType, i: CustomerInsight, cfg: ScoringSettings, segment?: SegmentRules): Candidate | null {
  switch (type) {
    case "win_back": {
      if (i.band !== "inactive") return null;
      return baseCandidate(i, cfg, [silenceReason(i)]);
    }
    case "prevent_churn": {
      if (i.isVip) return null; // VIPs are handled in retain_vip
      const lapsing = i.band === "at_risk";
      const declining = i.band === "active" && i.frequencyDeclined;
      if (!lapsing && !declining) return null;
      const reasons: Reason[] = [];
      if (lapsing) reasons.push(silenceReason(i));
      if (i.frequencyDeclined) reasons.push({ key: "frequencyDown", params: { recent: i.recent90, prior: i.prior90 } });
      return baseCandidate(i, cfg, reasons);
    }
    case "retain_vip": {
      if (!i.isVip) return null;
      const slipping = i.band === "at_risk" || i.band === "inactive" || (i.band === "active" && i.frequencyDeclined);
      if (!slipping) return null;
      const reasons: Reason[] = [];
      if (i.band === "at_risk" || i.band === "inactive") reasons.push(silenceReason(i));
      if (i.frequencyDeclined) reasons.push({ key: "frequencyDown", params: { recent: i.recent90, prior: i.prior90 } });
      return baseCandidate(i, cfg, reasons);
    }
    case "new_customer": {
      if (i.visitCount !== 1 || i.daysSinceLast === null) return null;
      if (i.daysSinceLast < cfg.newGraceDays || i.daysSinceLast > cfg.newWindowDays + 15) return null;
      return baseCandidate(i, cfg, [{ key: "newNoReturn", params: { days: i.daysSinceLast } }]);
    }
    case "birthday": {
      if (i.birthdayInDays === null || i.birthdayInDays > cfg.birthdayLeadDays) return null;
      return baseCandidate(i, cfg, [i.birthdayInDays === 0 ? { key: "birthdayToday" } : { key: "birthdaySoon", params: { days: i.birthdayInDays } }]);
    }
    case "points_reminder": {
      if (!i.rewardReady) return null;
      if (i.daysSinceContact !== null && i.daysSinceContact < cfg.pointsReminderCooldownDays) return null;
      const r = i.affordableRewards[0]!;
      const c = baseCandidate(i, cfg, [{ key: "rewardReadyFull", params: { reward: r.name, points: i.pointsBalance, cost: r.cost } }]);
      // avoid duplicating the generic rewardReady reason
      c.reasons = c.reasons.filter((x) => x.key !== "rewardReady");
      return c;
    }
    case "custom": {
      if (!segment || !matchesSegment(i, segment)) return null;
      return baseCandidate(i, cfg, [{ key: "segmentMatch" }]);
    }
  }
}

export function matchesSegment(i: CustomerInsight, r: SegmentRules): boolean {
  if (r.bands?.length && !r.bands.includes(i.band)) return false;
  if (r.minDaysSinceLast !== undefined && (i.daysSinceLast === null || i.daysSinceLast < r.minDaysSinceLast)) return false;
  if (r.maxDaysSinceLast !== undefined && (i.daysSinceLast === null || i.daysSinceLast > r.maxDaysSinceLast)) return false;
  if (r.minVisits !== undefined && i.visitCount < r.minVisits) return false;
  if (r.minSpendMinor !== undefined && i.spendMinor < r.minSpendMinor) return false;
  if (r.minPoints !== undefined && i.pointsBalance < r.minPoints) return false;
  if (r.tags?.length && !r.tags.every((t) => i.tags.some((x) => x.toLowerCase() === t.toLowerCase()))) return false;
  if (r.tierIds?.length && (!i.tierId || !r.tierIds.includes(i.tierId))) return false;
  if (r.birthdayMonth !== undefined) {
    const m = /^(?:\d{4}|-)-(\d{2})-\d{2}$/.exec(i.birthday ?? "");
    if (!m || Number(m[1]) !== r.birthdayMonth) return false;
  }
  return true;
}

export function rankCandidates(list: Candidate[]): Candidate[] {
  return [...list].sort((a, b) => Number(a.blocked !== null) - Number(b.blocked !== null) || b.priority - a.priority || a.customerId.localeCompare(b.customerId));
}
