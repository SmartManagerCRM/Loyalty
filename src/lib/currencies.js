// PLACEHOLDER — this is the same short list already used in
// Onboarding/BusinessSettings today. The full MENA + major-currency list
// (SAR/AED/QAR/KWD/BHD/OMR/JOD/EGP/IQD/LBP/ILS/SYP/YER/LYD/TND/DZD/MAD/
// MRU/DJF/SOS/SDG + USD/EUR/GBP/TRY) plus proper currency metadata
// (decimal places, symbol) and the formatMoney() helper used everywhere
// money is displayed is the Currency Architecture phase — this file is
// the one place that phase will replace, so nothing else has to change.
export const CURRENCIES = [
  { code: "SAR", name: "Saudi Riyal" },
  { code: "AED", name: "UAE Dirham" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "JOD", name: "Jordanian Dinar" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "LBP", name: "Lebanese Pound" },
  { code: "MAD", name: "Moroccan Dirham" },
  { code: "USD", name: "US Dollar" },
];
