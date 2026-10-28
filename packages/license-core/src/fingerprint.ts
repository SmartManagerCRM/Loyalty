import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "./encoding";
import { PRODUCT_ID } from "./types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
const CHARS = 20; // 100 bits

/** Derive the human-copyable device binding fingerprint from the secret installation id. */
export function deriveFingerprint(installId: string): string {
  if (!installId || installId.length < 16) throw new Error("installId too short");
  const digest = sha256(utf8ToBytes(`${PRODUCT_ID}|device-binding|v1|${installId}`));
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const byte of digest) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < CHARS) {
      out += ALPHABET[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
    if (out.length >= CHARS) break;
  }
  return out.match(/.{4}/g)!.join("-");
}

export function isValidFingerprint(value: string): boolean {
  return /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){4}$/.test(value);
}

export function normalizeFingerprint(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.match(/.{1,4}/g)?.join("-") ?? "";
}
