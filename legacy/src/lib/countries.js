// Drives the Onboarding wizard's Country step: picking a country
// pre-fills a sensible currency and default_language (the schema only
// supports 'en'/'ar' for default_language — see supabase/schema.sql —
// so every non-Arabic-speaking country defaults to 'en'). Both remain
// fully editable in the next steps and later in Business Settings.
export const COUNTRIES = [
  { code: "SA", name: "Saudi Arabia", currency: "SAR", language: "ar" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", language: "ar" },
  { code: "QA", name: "Qatar", currency: "QAR", language: "ar" },
  { code: "KW", name: "Kuwait", currency: "KWD", language: "ar" },
  { code: "BH", name: "Bahrain", currency: "BHD", language: "ar" },
  { code: "OM", name: "Oman", currency: "OMR", language: "ar" },
  { code: "JO", name: "Jordan", currency: "JOD", language: "ar" },
  { code: "EG", name: "Egypt", currency: "EGP", language: "ar" },
  { code: "IQ", name: "Iraq", currency: "IQD", language: "ar" },
  { code: "LB", name: "Lebanon", currency: "LBP", language: "ar" },
  { code: "SY", name: "Syria", currency: "SYP", language: "ar" },
  { code: "YE", name: "Yemen", currency: "YER", language: "ar" },
  { code: "LY", name: "Libya", currency: "LYD", language: "ar" },
  { code: "TN", name: "Tunisia", currency: "TND", language: "ar" },
  { code: "DZ", name: "Algeria", currency: "DZD", language: "ar" },
  { code: "MA", name: "Morocco", currency: "MAD", language: "ar" },
  { code: "MR", name: "Mauritania", currency: "MRU", language: "ar" },
  { code: "DJ", name: "Djibouti", currency: "DJF", language: "ar" },
  { code: "SO", name: "Somalia", currency: "SOS", language: "ar" },
  { code: "SD", name: "Sudan", currency: "SDG", language: "ar" },
  { code: "IL", name: "Israel", currency: "ILS", language: "en" },
  { code: "US", name: "United States", currency: "USD", language: "en" },
  { code: "EU", name: "Eurozone", currency: "EUR", language: "en" },
  { code: "GB", name: "United Kingdom", currency: "GBP", language: "en" },
  { code: "TR", name: "Turkey", currency: "TRY", language: "en" },
];

export function getCountry(code) {
  return COUNTRIES.find((c) => c.code === code) || null;
}
