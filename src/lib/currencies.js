// Every currency the app supports, with the decimal precision ISO 4217
// actually defines for it (KWD/BHD/OMR/JOD/IQD/LYD/TND use 3 decimal
// places, DJF uses 0 — getting this wrong isn't cosmetic, it misstates
// real money). This is the single source of truth: formatMoney() below,
// every currency selector, and Onboarding/Business Settings all read
// from this one list.
export const CURRENCIES = [
  // MENA
  { code: "SAR", name: "Saudi Riyal", decimals: 2 },
  { code: "AED", name: "UAE Dirham", decimals: 2 },
  { code: "QAR", name: "Qatari Riyal", decimals: 2 },
  { code: "KWD", name: "Kuwaiti Dinar", decimals: 3 },
  { code: "BHD", name: "Bahraini Dinar", decimals: 3 },
  { code: "OMR", name: "Omani Rial", decimals: 3 },
  { code: "JOD", name: "Jordanian Dinar", decimals: 3 },
  { code: "EGP", name: "Egyptian Pound", decimals: 2 },
  { code: "IQD", name: "Iraqi Dinar", decimals: 3 },
  { code: "LBP", name: "Lebanese Pound", decimals: 2 },
  { code: "ILS", name: "Israeli New Shekel", decimals: 2 },
  { code: "SYP", name: "Syrian Pound", decimals: 2 },
  { code: "YER", name: "Yemeni Rial", decimals: 2 },
  { code: "LYD", name: "Libyan Dinar", decimals: 3 },
  { code: "TND", name: "Tunisian Dinar", decimals: 3 },
  { code: "DZD", name: "Algerian Dinar", decimals: 2 },
  { code: "MAD", name: "Moroccan Dirham", decimals: 2 },
  { code: "MRU", name: "Mauritanian Ouguiya", decimals: 2 },
  { code: "DJF", name: "Djiboutian Franc", decimals: 0 },
  { code: "SOS", name: "Somali Shilling", decimals: 2 },
  { code: "SDG", name: "Sudanese Pound", decimals: 2 },
  // Major
  { code: "USD", name: "US Dollar", decimals: 2 },
  { code: "EUR", name: "Euro", decimals: 2 },
  { code: "GBP", name: "British Pound", decimals: 2 },
  { code: "TRY", name: "Turkish Lira", decimals: 2 },
];

const BY_CODE = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code) {
  return BY_CODE[code] || { code: code || "", name: code || "", decimals: 2 };
}

// The one place every money amount in the app should pass through.
// Deliberately prefixes the ISO code (SAR 1,234.00) rather than a
// symbol — many of these currencies don't have a widely-supported
// symbol glyph, and a code is unambiguous across all of them, which a
// symbol like "ر.س" vs "$" is not when several currencies share one.
export function formatMoney(amount, currencyCode) {
  const { code, decimals } = getCurrency(currencyCode);
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return code ? `${code} ${formatted}` : formatted;
}
