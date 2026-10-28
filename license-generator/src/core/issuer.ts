import { randomUUID } from "node:crypto";
import {
  LicensePayload, licenseToCompact, LicenseType, parseActivationRequest, PRODUCT_ID, serializeLicenseFile, signLicense, verifyLicense, SCHEMA_VERSION,
} from "@smloyalty/license-core";
import { HistoryStore } from "./history";
import { KeyStore } from "./keystore";
import { GeneratorError, IssuedRecord, IssueOptions, IssueResult, ReissueOptions } from "./types";

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Add calendar months in local time, clamped to the last day of the target month. */
export function addMonthsLocal(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

export function endOfLocalDay(ymd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new GeneratorError("date_invalid");
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d, 23, 59, 59, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) throw new GeneratorError("date_invalid");
  return dt.getTime();
}

export class Issuer {
  constructor(private readonly keys: KeyStore, private readonly history: HistoryStore, private readonly now: () => number = Date.now) {}

  parseRequest(text: string) {
    const r = parseActivationRequest(text);
    if (!r.ok) throw new GeneratorError("request_invalid", r.message);
    return r.request;
  }

  private buildPayload(o: IssueOptions, replaces?: string): { payload: LicensePayload; request: ReturnType<Issuer["parseRequest"]> } {
    const request = this.parseRequest(o.requestText);
    const now = this.now();
    const validFromMs = o.validFrom ? Date.parse(o.validFrom) : now - 3600_000;
    if (Number.isNaN(validFromMs)) throw new GeneratorError("date_invalid");
    let expiresAt: string | null = null;
    if (o.licenseType === "custom_duration") {
      let expMs: number;
      if (o.expiresOn) expMs = endOfLocalDay(o.expiresOn);
      else if (o.durationMonths && Number.isInteger(o.durationMonths) && o.durationMonths >= 1 && o.durationMonths <= 120) expMs = addMonthsLocal(new Date(validFromMs + 3600_000), o.durationMonths).getTime();
      else throw new GeneratorError("duration_required");
      if (expMs <= now) throw new GeneratorError("expiry_in_past");
      if (expMs <= validFromMs) throw new GeneratorError("expiry_before_start");
      expiresAt = iso(expMs);
    } else if (o.expiresOn || o.durationMonths) {
      throw new GeneratorError("lifetime_has_no_expiry");
    }
    const features = [...new Set(["core", ...(o.features ?? [])])].sort();
    if (features.some((f) => !/^[a-z0-9_]{1,40}$/.test(f))) throw new GeneratorError("features_invalid");
    const customerReference = o.customerReference.trim().slice(0, 120);
    if (!customerReference) throw new GeneratorError("reference_required");
    const key = this.keys.trustedKey();
    const payload: LicensePayload = {
      schemaVersion: SCHEMA_VERSION, productId: PRODUCT_ID, licenseId: randomUUID(), customerReference, licenseType: o.licenseType as LicenseType,
      issuedAt: iso(now), validFrom: iso(validFromMs), expiresAt, deviceBinding: request.deviceBinding, features, keyId: key.keyId,
      metadata: { requestId: request.requestId, ...(replaces ? { replaces } : {}) },
    };
    return { payload, request };
  }

  private sign(payload: LicensePayload, notes: string, request: ReturnType<Issuer["parseRequest"]>, extra: Partial<IssuedRecord>): IssueResult {
    const env = this.keys.withSeed((seed) => signLicense(payload, seed));
    const fileText = serializeLicenseFile(env);
    // verify what we are about to hand out exactly like the app will
    const check = verifyLicense(fileText, { trustedKeys: [this.keys.trustedKey()], deviceFingerprint: payload.deviceBinding.value });
    if (!check.ok) throw new GeneratorError("self_check_failed", check.message);
    const slug = payload.customerReference.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "customer";
    const fileName = `${slug}-${payload.licenseType === "lifetime" ? "lifetime" : "until-" + payload.expiresAt!.slice(0, 10)}-${payload.deviceBinding.value.slice(0, 4)}.smloyaltylicense`;
    const record: IssuedRecord = {
      licenseId: payload.licenseId, customerReference: payload.customerReference, notes, licenseType: payload.licenseType, issuedAt: payload.issuedAt,
      validFrom: payload.validFrom, expiresAt: payload.expiresAt, deviceFingerprint: payload.deviceBinding.value, requestId: request.requestId,
      requestPlatform: request.platform, requestAppVersion: request.appVersion, keyId: payload.keyId, features: payload.features, fileName, fileText, status: "active", ...extra,
    };
    return { record, fileText, compactText: licenseToCompact(env), fileName, summary: Issuer.summary(record) };
  }

  static summary(r: IssuedRecord): string[] {
    return [
      `Product: SmartManager Loyalty`, `Customer: ${r.customerReference}`, `License ID: ${r.licenseId}`,
      `Type: ${r.licenseType === "lifetime" ? "Lifetime (no expiry)" : "Fixed period"}`, `Valid from: ${r.validFrom}`, `Valid until: ${r.expiresAt ?? "no expiry"}`,
      `Device: ${r.deviceFingerprint}`, `Features: ${r.features.join(", ")}`, `Issued: ${r.issuedAt} (key ${r.keyId})`,
    ];
  }

  /** First license for a device. Refuses when the device already has an active license (use reissue/renew). */
  issue(o: IssueOptions): IssueResult {
    const { payload, request } = this.buildPayload(o);
    const existing = this.history.activeForDevice(payload.deviceBinding.value);
    if (existing) throw new GeneratorError("device_already_licensed", existing.licenseId);
    const res = this.sign(payload, o.notes?.trim() ?? "", request, {});
    this.history.add(res.record);
    return res;
  }

  /** Renew / extend a license on the SAME device (e.g. a new period). The previous record becomes superseded. */
  renew(o: IssueOptions & { renewsLicenseId: string }): IssueResult {
    const old = this.history.get(o.renewsLicenseId);
    if (!old) throw new GeneratorError("not_found");
    const { payload, request } = this.buildPayload(o, old.licenseId);
    if (payload.deviceBinding.value !== old.deviceFingerprint) throw new GeneratorError("device_differs");
    const res = this.sign(payload, o.notes?.trim() ?? old.notes, request, { replaces: old.licenseId, reissueReason: "renewal" });
    this.history.add(res.record);
    this.history.markSuperseded(old.licenseId, res.record.licenseId, "renewal");
    return res;
  }

  /**
   * Device replacement: an owner-controlled reissue for a NEW device. Requires a reason and explicit confirmation.
   * Offline software cannot revoke the old license; the record only documents the replacement.
   */
  reissue(o: ReissueOptions): IssueResult {
    if (!o.confirmed) throw new GeneratorError("confirmation_required");
    const why = o.reason.trim();
    if (why.length < 5) throw new GeneratorError("reason_required");
    const old = this.history.get(o.replacesLicenseId);
    if (!old) throw new GeneratorError("not_found");
    const { payload, request } = this.buildPayload(o, old.licenseId);
    if (payload.deviceBinding.value === old.deviceFingerprint) throw new GeneratorError("same_device_use_renew");
    const other = this.history.activeForDevice(payload.deviceBinding.value);
    if (other && other.licenseId !== old.licenseId) throw new GeneratorError("device_already_licensed", other.licenseId);
    const res = this.sign(payload, o.notes?.trim() ?? old.notes, request, { replaces: old.licenseId, reissueReason: why });
    this.history.add(res.record);
    this.history.markSuperseded(old.licenseId, res.record.licenseId, why);
    return res;
  }
}
