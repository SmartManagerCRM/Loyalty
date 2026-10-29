import type { CurrencyConfig } from "./money";

export type Language = "en" | "ar" | "fr";
export type DateFormat = "DMY" | "MDY" | "YMD";

export interface BusinessSettings {
  name: string;
  type: string;
  phone: string;
  logoDataUrl: string | null;
  countryCallingCode: string;
}
export interface EarnRule {
  /** Spend this much (minor units) to earn `points`. */
  perAmountMinor: number;
  points: number;
  perVisitBonus: number;
  minPurchaseMinor: number;
}
export interface ScoringSettings {
  defaultIntervalDays: number;
  atRiskPct: number;
  atRiskMinDays: number;
  winBackPct: number;
  winBackMinDays: number;
  newWindowDays: number;
  newGraceDays: number;
  declineRatioPct: number;
  declineMinPriorVisits: number;
  cooldownDays: number;
  birthdayLeadDays: number;
  pointsReminderCooldownDays: number;
}
export interface LocaleSettings {
  language: Language;
  dateFormat: DateFormat;
}
export interface CustomFieldDef {
  key: string;
  label: string;
}

export interface SettingsMap {
  business: BusinessSettings;
  locale: LocaleSettings;
  currency: CurrencyConfig;
  earnRule: EarnRule;
  scoring: ScoringSettings;
  setupComplete: boolean;
  customOutcomes: string[];
  customFields: CustomFieldDef[];
  nextCustomerNumber: number;
  lastBackupAt: string | null;
  backupReminderDays: number;
}

export const DEFAULT_SETTINGS: SettingsMap = {
  business: { name: "", type: "", phone: "", logoDataUrl: null, countryCallingCode: "" },
  locale: { language: "en", dateFormat: "DMY" },
  currency: { code: "SAR", decimals: 2 },
  earnRule: { perAmountMinor: 1000, points: 1, perVisitBonus: 0, minPurchaseMinor: 0 },
  scoring: {
    defaultIntervalDays: 30,
    atRiskPct: 150,
    atRiskMinDays: 21,
    winBackPct: 300,
    winBackMinDays: 60,
    newWindowDays: 30,
    newGraceDays: 7,
    declineRatioPct: 50,
    declineMinPriorVisits: 3,
    cooldownDays: 14,
    birthdayLeadDays: 7,
    pointsReminderCooldownDays: 30,
  },
  setupComplete: false,
  customOutcomes: [],
  customFields: [],
  nextCustomerNumber: 1,
  lastBackupAt: null,
  backupReminderDays: 14,
};

export const BUSINESS_TYPES = ["salon", "clinic", "gym", "cafe", "retail", "barber", "spa", "other"] as const;
