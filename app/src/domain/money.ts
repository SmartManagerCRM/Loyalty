/** Money is always an integer count of minor units (e.g. halalas/cents). No floats. */
export interface CurrencyConfig {
  code: string;
  decimals: number; // minor-unit digits: 0, 2 or 3
  symbol?: string;
}

export const CURRENCIES: CurrencyConfig[] = [
  { code: "SAR", decimals: 2 }, { code: "AED", decimals: 2 }, { code: "KWD", decimals: 3 }, { code: "QAR", decimals: 2 },
  { code: "BHD", decimals: 3 }, { code: "OMR", decimals: 3 }, { code: "EGP", decimals: 2 }, { code: "JOD", decimals: 3 },
  { code: "USD", decimals: 2 }, { code: "EUR", decimals: 2 }, { code: "GBP", decimals: 2 }, { code: "MAD", decimals: 2 },
  { code: "TND", decimals: 3 }, { code: "DZD", decimals: 2 }, { code: "TRY", decimals: 2 }, { code: "PKR", decimals: 2 },
  { code: "INR", decimals: 2 }, { code: "JPY", decimals: 0 },
];

/** Parse a user-entered decimal string into minor units. Returns null when invalid. */
export function parseMoney(input: string, decimals: number): number | null {
  const norm = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)) // Arabic-Indic digits
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٫]/g, ".")
    .replace(/[٬,\s]/g, "")
    .replace(/,/g, ".");
  if (!/^\d+(\.\d+)?$/.test(norm)) return null;
  const [whole, frac = ""] = norm.split(".");
  if (frac.length > decimals) return null;
  const minor = Number(whole! + frac.padEnd(decimals, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function formatMoney(minor: number, cur: CurrencyConfig, locale?: string): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const base = 10 ** cur.decimals;
  const whole = Math.floor(abs / base);
  const frac = String(abs % base).padStart(cur.decimals, "0");
  const wholeStr = new Intl.NumberFormat(locale ?? "en", { useGrouping: true, numberingSystem: "latn" }).format(whole);
  const num = cur.decimals > 0 ? `${wholeStr}.${frac}` : wholeStr;
  return `${neg ? "-" : ""}${num} ${cur.symbol ?? cur.code}`;
}

/** Plain decimal string for inputs/CSV (no grouping). */
export function minorToDecimalString(minor: number, decimals: number): string {
  const abs = Math.abs(minor);
  const base = 10 ** decimals;
  const whole = Math.floor(abs / base);
  return `${minor < 0 ? "-" : ""}${whole}${decimals > 0 ? "." + String(abs % base).padStart(decimals, "0") : ""}`;
}
