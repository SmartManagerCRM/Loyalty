export const PRODUCT_ID = "smartmanager-loyalty";
export const LICENSE_FORMAT = "smloyalty-license";
export const REQUEST_FORMAT = "smloyalty-activation-request";
export const SCHEMA_VERSION = 1;
export const SIGNING_DOMAIN = "SMARTMANAGER-LOYALTY-LICENSE-V1\n";

export type LicenseType = "lifetime" | "custom_duration";

export interface DeviceBinding {
  type: "installation-fingerprint";
  value: string;
}

export interface LicensePayload {
  schemaVersion: number;
  productId: string;
  licenseId: string;
  customerReference: string;
  licenseType: LicenseType;
  issuedAt: string;
  validFrom: string;
  expiresAt: string | null;
  deviceBinding: DeviceBinding;
  features: string[];
  keyId: string;
  /** Small, non-sensitive, string-valued extras (e.g. `replaces`, `requestId`). */
  metadata?: Record<string, string>;
}

export interface LicenseEnvelope {
  format: typeof LICENSE_FORMAT;
  schemaVersion: number;
  keyId: string;
  /** Canonical JSON string of the payload; this exact string is what is signed. */
  payload: string;
  /** base64url Ed25519 signature */
  signature: string;
}

export interface TrustedKey {
  keyId: string;
  /** base64url raw 32-byte Ed25519 public key */
  publicKey: string;
  /** Optional ISO window in which the key may be used to *issue*; checked against payload.issuedAt. */
  notBefore?: string;
  notAfter?: string;
  note?: string;
}

export interface ActivationRequest {
  format: typeof REQUEST_FORMAT;
  schemaVersion: number;
  productId: string;
  requestId: string;
  deviceBinding: DeviceBinding;
  createdAt: string;
  appVersion: string;
  platform: string;
  /** Optional hint typed by the customer (usually the business name). */
  customerReference?: string;
  /** SHA-256 (hex, first 16 chars) of the canonical request without this field; catches typos/truncation, not tampering. */
  checksum: string;
}

export type LicenseFailureCode =
  | "malformed"
  | "unknown_format"
  | "unsupported_schema"
  | "unknown_key"
  | "key_not_valid_for_issue_date"
  | "bad_signature"
  | "non_canonical"
  | "missing_field"
  | "wrong_product"
  | "wrong_device";

export type LicenseCheck =
  | { ok: true; payload: LicensePayload; envelope: LicenseEnvelope }
  | { ok: false; code: LicenseFailureCode; message: string };

export type ValidityState = "active" | "not_yet_valid" | "expired" | "clock_anomaly";

export interface ValidityResult {
  state: ValidityState;
  /** Whole days until expiry (can be negative), null for lifetime. */
  daysRemaining: number | null;
}
