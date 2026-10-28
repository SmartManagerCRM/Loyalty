import type { LicenseType } from "@smloyalty/license-core";

export type RecordStatus = "active" | "superseded";

export interface IssuedRecord {
  /** same as the licenseId inside the signed payload */
  licenseId: string;
  customerReference: string;
  notes: string;
  licenseType: LicenseType;
  issuedAt: string;
  validFrom: string;
  expiresAt: string | null;
  deviceFingerprint: string;
  requestId: string;
  requestPlatform: string;
  requestAppVersion: string;
  keyId: string;
  features: string[];
  fileName: string;
  /** exact license file text, so it can be re-exported later */
  fileText: string;
  status: RecordStatus;
  supersededBy?: string;
  replaces?: string;
  reissueReason?: string;
}

export interface HistoryFilter {
  query?: string;
  type?: LicenseType | "all";
  /** derived state at `now` */
  state?: "all" | "active" | "expiring" | "expired" | "superseded";
}

export type DerivedState = "active" | "expiring" | "expired" | "superseded" | "not_started";

export interface IssueOptions {
  requestText: string;
  customerReference: string;
  notes?: string;
  licenseType: LicenseType;
  /** custom_duration: choose one of the following */
  durationMonths?: number;
  /** local date YYYY-MM-DD; the license is valid through the end of this local day */
  expiresOn?: string;
  /** ISO instant; defaults to one hour before now to tolerate device clocks */
  validFrom?: string;
  features?: string[];
}

export interface ReissueOptions extends IssueOptions {
  replacesLicenseId: string;
  reason: string;
  /** must be true: owner confirms the old device will no longer be licensed */
  confirmed: boolean;
}

export interface IssueResult {
  record: IssuedRecord;
  fileText: string;
  compactText: string;
  fileName: string;
  summary: string[];
}

export class GeneratorError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
    this.name = "GeneratorError";
  }
}
