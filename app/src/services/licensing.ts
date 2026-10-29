import {
  activationRequestToCompact, createActivationRequest, deriveFingerprint, evaluateValidity, LicensePayload, parseIso,
  serializeActivationRequest, ValidityResult, verifyLicense, TrustedKey, ActivationRequest, LicenseFailureCode, CLOCK_ROLLBACK_TOLERANCE_MS,
} from "@smloyalty/license-core";
import type { Db } from "../database/db";
import { DomainError } from "../database/db";
import { uuid } from "../domain/ids";

/** Small secret/identifier store. Native: Android Keystore / iOS Keychain via capacitor-secure-storage-plugin. */
export interface SecureKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  readonly kind: "keystore" | "browser-storage" | "memory";
}

export type LicenseStatusKind = "unlicensed" | "active" | "expired" | "not_yet_valid" | "clock_anomaly" | "invalid";

export interface LicenseStatus {
  kind: LicenseStatusKind;
  payload?: LicensePayload;
  validity?: ValidityResult;
  /** populated for `invalid` */
  failure?: LicenseFailureCode;
  fingerprint: string;
  lastSeenMs: number;
  clockReviewsLeft: number;
}

export const MAX_CLOCK_REVIEWS = 2;
const TOUCH_MIN_INTERVAL_MS = 60_000;

export class LicenseManager {
  fingerprint = "";
  private stored: { text: string | null; lastSeenMs: number; clockReviews: number } = { text: null, lastSeenMs: 0, clockReviews: 0 };
  private current: LicenseStatus = { kind: "unlicensed", fingerprint: "", lastSeenMs: 0, clockReviewsLeft: MAX_CLOCK_REVIEWS };
  private lastTouch = 0;
  private listeners = new Set<(s: LicenseStatus) => void>();

  constructor(
    private readonly db: Db,
    private readonly kv: SecureKV,
    private readonly trustedKeys: TrustedKey[],
    private readonly opts: { now?: () => number; appVersion?: string; platform?: string } = {},
  ) {}

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  /** Load the device identity and stored license, verify everything again, and compute the current status. */
  async init(): Promise<LicenseStatus> {
    let id = await this.kv.get("installId");
    if (!id || id.length < 16) {
      id = uuid() + uuid().slice(0, 8);
      await this.kv.set("installId", id);
    }
    this.fingerprint = deriveFingerprint(id);

    const row = await this.db.get<{ license_text: string | null; last_seen_ms: number; clock_reviews: number }>("SELECT license_text, last_seen_ms, clock_reviews FROM license_state WHERE id = 1");
    const kvSeen = Number((await this.kv.get("lastSeenMs")) ?? 0) || 0;
    this.stored = { text: row?.license_text ?? null, lastSeenMs: Math.max(Number(row?.last_seen_ms ?? 0), kvSeen), clockReviews: Number(row?.clock_reviews ?? 0) };
    await this.refresh(true);
    return this.current;
  }

  get status(): LicenseStatus {
    return this.current;
  }

  subscribe(fn: (s: LicenseStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** True when data-changing features are allowed. Reading, exporting and backing up are always allowed. */
  canWrite(): boolean {
    return this.current.kind === "active";
  }

  assertWritable(): void {
    if (!this.canWrite()) throw new DomainError("license_restricted", `License is ${this.current.kind}`);
  }

  private async persistSeen(ms: number) {
    this.stored.lastSeenMs = ms;
    await this.db.run(
      `INSERT INTO license_state (id, last_seen_ms, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET last_seen_ms = excluded.last_seen_ms, updated_at = excluded.updated_at`,
      [ms, new Date(this.now()).toISOString()],
    );
    await this.kv.set("lastSeenMs", String(ms));
  }

  /** Compute status from stored license + clock; advance the "last seen" high-water mark when time moves forward normally. */
  async refresh(force = false): Promise<LicenseStatus> {
    const now = this.now();
    let status: LicenseStatus;
    const base = { fingerprint: this.fingerprint, clockReviewsLeft: Math.max(0, MAX_CLOCK_REVIEWS - this.stored.clockReviews) };
    if (!this.stored.text) {
      status = { kind: "unlicensed", lastSeenMs: this.stored.lastSeenMs, ...base };
    } else {
      const check = verifyLicense(this.stored.text, { trustedKeys: this.trustedKeys, deviceFingerprint: this.fingerprint });
      if (!check.ok) {
        status = { kind: "invalid", failure: check.code, lastSeenMs: this.stored.lastSeenMs, ...base };
      } else {
        const v = evaluateValidity(check.payload, now, this.stored.lastSeenMs || null);
        status = { kind: v.state, payload: check.payload, validity: v, lastSeenMs: this.stored.lastSeenMs, ...base };
      }
    }
    // Only move the high-water mark forward, and never in an anomalous state
    if (status.kind !== "clock_anomaly" && now > this.stored.lastSeenMs && (force || now - this.lastTouch >= TOUCH_MIN_INTERVAL_MS)) {
      this.lastTouch = now;
      await this.persistSeen(now);
      status.lastSeenMs = now;
    }
    this.current = status;
    this.listeners.forEach((l) => l(status));
    return status;
  }

  /** Call periodically / on app resume. */
  touch(): Promise<LicenseStatus> {
    return this.refresh(false);
  }

  /** The customer confirms the device date is right after a rollback was detected (limited number of times). */
  async reviewClock(): Promise<LicenseStatus> {
    if (this.current.kind !== "clock_anomaly") return this.current;
    if (this.stored.clockReviews >= MAX_CLOCK_REVIEWS) throw new DomainError("clock_reviews_exhausted");
    const now = this.now();
    this.stored.clockReviews++;
    await this.db.run(
      `INSERT INTO license_state (id, clock_reviews, last_seen_ms, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET clock_reviews = excluded.clock_reviews, last_seen_ms = excluded.last_seen_ms, updated_at = excluded.updated_at`,
      [this.stored.clockReviews, now, new Date(now).toISOString()],
    );
    this.stored.lastSeenMs = now;
    await this.kv.set("lastSeenMs", String(now));
    return this.refresh(true);
  }

  buildActivationRequest(customerReference?: string): { request: ActivationRequest; fileText: string; compactText: string; filename: string } {
    const request = createActivationRequest({
      fingerprint: this.fingerprint, requestId: uuid(), createdAt: new Date(this.now()).toISOString().replace(/\.\d{3}Z$/, "Z"),
      appVersion: this.opts.appVersion ?? "1.0.1", platform: this.opts.platform ?? "unknown", customerReference,
    });
    return { request, fileText: serializeActivationRequest(request), compactText: activationRequestToCompact(request), filename: `activation-request-${this.fingerprint.replace(/-/g, "").slice(0, 8)}.smloyaltyrequest` };
  }

  /**
   * Verify and install a license file. Rejects invalid, wrong-device, wrong-product, already-expired
   * or older-than-installed licenses. Never modifies business data.
   */
  async importLicense(text: string): Promise<LicenseStatus> {
    const check = verifyLicense(text, { trustedKeys: this.trustedKeys, deviceFingerprint: this.fingerprint });
    if (!check.ok) throw new DomainError(`license_${check.code}`, check.message);
    const now = this.now();
    const v = evaluateValidity(check.payload, now, this.stored.lastSeenMs || null);
    if (v.state === "expired") throw new DomainError("license_expired_on_import");
    if (v.state === "clock_anomaly") throw new DomainError("license_clock_anomaly");
    if (this.stored.text) {
      const cur = verifyLicense(this.stored.text, { trustedKeys: this.trustedKeys, deviceFingerprint: this.fingerprint });
      if (cur.ok && parseIso(check.payload.issuedAt) < parseIso(cur.payload.issuedAt)) throw new DomainError("license_older_than_installed");
    }
    await this.db.run(
      `INSERT INTO license_state (id, license_text, license_id, activated_at, last_seen_ms, updated_at) VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET license_text = excluded.license_text, license_id = excluded.license_id, activated_at = excluded.activated_at, updated_at = excluded.updated_at`,
      [text.trim(), check.payload.licenseId, new Date(now).toISOString(), Math.max(now, this.stored.lastSeenMs), new Date(now).toISOString()],
    );
    this.stored.text = text.trim();
    return this.refresh(true);
  }

  static readonly ROLLBACK_TOLERANCE_MS = CLOCK_ROLLBACK_TOLERANCE_MS;
}
