import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

const LANG_KEY = "smartmanager-loyalty:ui-language";
const RTL_LANGUAGES = new Set(["ar"]);

function storedLanguage() {
  try { return window.localStorage.getItem(LANG_KEY) || "en"; } catch (e) { return "en"; }
}

const initialLanguage = storedLanguage();

// Applied synchronously at import time (not in a useEffect) so the very
// first paint — including the Login screen, before any auth/Header
// exists — already has the right language and text direction. Without
// this, a returning Arabic-preferring user would see a flash of English
// LTR on every page load until Header mounted and reconciled it.
document.documentElement.dir = RTL_LANGUAGES.has(initialLanguage) ? "rtl" : "ltr";
document.documentElement.lang = initialLanguage;

// French is architecturally supported (add fr.json + register it here,
// then remove the `comingSoon` flag in LanguageSelector.jsx) but not
// translated yet.
i18next
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: initialLanguage,
    fallbackLng: "en",
    interpolation: { escapeValue: false }, // React already escapes
    returnEmptyString: false,
  });

export default i18next;
