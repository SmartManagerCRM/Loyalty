export type Channel = "whatsapp" | "sms" | "call" | "email" | "none";
export type Consent = "granted" | "unknown" | "do_not_contact";

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  phoneNorm: string | null;
  email: string | null;
  birthday: string | null;
  notes: string | null;
  preferredChannel: Channel;
  consent: Consent;
  customFields: Record<string, string>;
  tags: string[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  notes?: string | null;
  preferredChannel?: Channel;
  consent?: Consent;
  customFields?: Record<string, string>;
  tags?: string[];
}

export interface TransactionRow {
  id: string;
  customerId: string;
  amountMinor: number;
  occurredAt: string;
  note: string | null;
  source: "manual" | "import";
  pointsEarned: number;
  status: "active" | "reversed";
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
}

export type LedgerKind = "earn" | "redeem" | "adjust" | "reversal" | "redeem_reversal";
export interface LedgerEntry {
  id: string;
  customerId: string;
  delta: number;
  kind: LedgerKind;
  refType: string | null;
  refId: string | null;
  reason: string | null;
  reversesEntryId: string | null;
  createdAt: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  active: boolean;
  expiresAt: string | null;
  archivedAt: string | null;
}

export interface Redemption {
  id: string;
  customerId: string;
  rewardId: string;
  rewardName: string;
  pointsCost: number;
  status: "redeemed" | "cancelled";
  redeemedAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  note: string | null;
}

export interface VipTier {
  id: string;
  name: string;
  minSpendMinor: number;
  minVisits: number;
  earnMultiplierPct: number;
  benefits: string | null;
  sortOrder: number;
  active: boolean;
}

export type AudienceType = "all" | "segment" | "selected";
export interface Offer {
  id: string;
  name: string;
  description: string | null;
  startsOn: string;
  endsOn: string | null;
  active: boolean;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  audience: AudienceType;
  /** e.g. "band:at_risk", "tier:<id>", "segment:<id>", "vip" */
  audienceKey: string | null;
  archivedAt: string | null;
}

export interface FollowUp {
  id: string;
  customerId: string;
  dueOn: string;
  note: string | null;
  status: "open" | "done" | "dismissed";
  smartActionId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type ActionType =
  | "win_back"
  | "prevent_churn"
  | "retain_vip"
  | "new_customer"
  | "birthday"
  | "points_reminder"
  | "custom";

export const ACTION_TYPES: ActionType[] = ["win_back", "prevent_churn", "retain_vip", "new_customer", "birthday", "points_reminder", "custom"];

export type BuiltInStatus = "not_contacted" | "prepared" | "contacted" | "replied" | "returned" | "not_interested";
export const BUILT_IN_STATUSES: BuiltInStatus[] = ["not_contacted", "prepared", "contacted", "replied", "returned", "not_interested"];

export interface MessageTemplate {
  id: string;
  name: string;
  actionType: ActionType;
  language: string;
  body: string;
  isDefault: boolean;
  active: boolean;
}

export interface SegmentRules {
  bands?: Band[];
  minDaysSinceLast?: number;
  maxDaysSinceLast?: number;
  minVisits?: number;
  minSpendMinor?: number;
  minPoints?: number;
  tags?: string[];
  tierIds?: string[];
  birthdayMonth?: number;
}
export interface Segment {
  id: string;
  name: string;
  rules: SegmentRules;
  archivedAt: string | null;
}

export type Band = "new" | "no_purchases" | "active" | "at_risk" | "inactive";

/** A structured, translatable explanation. UI turns it into text with t(`reason.${key}`, params). */
export interface Reason {
  key: string;
  params?: Record<string, string | number>;
}
