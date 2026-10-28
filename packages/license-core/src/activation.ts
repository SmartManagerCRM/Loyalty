import { sha256 } from "@noble/hashes/sha256";
import { base64urlDecodeString, base64urlEncodeString, bytesToHex, utf8ToBytes } from "./encoding";
import { canonicalize } from "./canonical";
import { isValidFingerprint } from "./fingerprint";
import { ActivationRequest, PRODUCT_ID, REQUEST_FORMAT, SCHEMA_VERSION } from "./types";

export const REQUEST_PREFIX = "SMLYREQ1:";

function checksumOf(req: Omit<ActivationRequest, "checksum">): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalize(req)))).slice(0, 16);
}

export function createActivationRequest(input: {
  fingerprint: string;
  requestId: string;
  createdAt: string;
  appVersion: string;
  platform: string;
  customerReference?: string;
}): ActivationRequest {
  const base: Omit<ActivationRequest, "checksum"> = {
    format: REQUEST_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    productId: PRODUCT_ID,
    requestId: input.requestId,
    deviceBinding: { type: "installation-fingerprint", value: input.fingerprint },
    createdAt: input.createdAt,
    appVersion: input.appVersion,
    platform: input.platform,
    ...(input.customerReference ? { customerReference: input.customerReference.slice(0, 120) } : {}),
  };
  return { ...base, checksum: checksumOf(base) };
}

export function serializeActivationRequest(req: ActivationRequest): string {
  return JSON.stringify(req, null, 2);
}

/** Compact single-line form that survives chat apps. */
export function activationRequestToCompact(req: ActivationRequest): string {
  return REQUEST_PREFIX + base64urlEncodeString(canonicalize(req));
}

export type ParsedRequest = { ok: true; request: ActivationRequest } | { ok: false; message: string };

export function parseActivationRequest(text: string): ParsedRequest {
  let raw = text.trim();
  try {
    if (raw.startsWith(REQUEST_PREFIX)) raw = base64urlDecodeString(raw.slice(REQUEST_PREFIX.length).replace(/\s+/g, ""));
    const obj = JSON.parse(raw) as Partial<ActivationRequest>;
    if (obj.format !== REQUEST_FORMAT) return { ok: false, message: "Not a SmartManager Loyalty activation request." };
    if (obj.schemaVersion !== SCHEMA_VERSION) return { ok: false, message: "Unsupported activation request version." };
    if (obj.productId !== PRODUCT_ID) return { ok: false, message: "This request is for a different product." };
    if (!obj.requestId || !obj.createdAt || !obj.appVersion || !obj.platform || !obj.checksum) return { ok: false, message: "Activation request is missing fields." };
    if (obj.deviceBinding?.type !== "installation-fingerprint" || !isValidFingerprint(obj.deviceBinding.value)) {
      return { ok: false, message: "Activation request has an invalid device fingerprint." };
    }
    const { checksum, ...rest } = obj as ActivationRequest;
    if (checksumOf(rest) !== checksum) return { ok: false, message: "Activation request is damaged or was edited (checksum mismatch)." };
    return { ok: true, request: obj as ActivationRequest };
  } catch {
    return { ok: false, message: "Could not read this activation request." };
  }
}
