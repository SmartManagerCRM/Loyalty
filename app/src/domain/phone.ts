/** Normalize a phone number to digits with country code where possible. Returns null when unusable. */
export function normalizePhone(raw: string | null | undefined, countryCallingCode = ""): string | null {
  if (!raw) return null;
  const ascii = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
  const hasPlus = ascii.trim().startsWith("+");
  let digits = ascii.replace(/\D/g, "");
  if (!digits) return null;
  if (!hasPlus) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0") && countryCallingCode) digits = countryCallingCode + digits.replace(/^0+/, "");
    else if (countryCallingCode && digits.length <= 10 && !digits.startsWith(countryCallingCode)) digits = countryCallingCode + digits;
  }
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase();
  return v ? v : null;
}

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Strip control characters and cap length. Used on all imported/typed free text. */
export function sanitizeText(v: unknown, max = 500): string {
  return String(v ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[‪-‮⁦-⁩]/g, "") // bidi override characters
    .trim()
    .slice(0, max);
}
