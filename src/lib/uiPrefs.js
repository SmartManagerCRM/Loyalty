import { useCallback, useEffect, useState } from "react";
import i18n from "./i18n";

// Personal "how do I want to view the app" preferences — deliberately
// separate from `businesses.default_language`, which is a business-level
// default for outbound content (WhatsApp message language), not a
// per-viewer display setting. Two people on the same team can view the
// app in different languages without changing what the business's
// customers see by default.
const LANG_KEY = "smartmanager-loyalty:ui-language";
const RTL_LANGUAGES = new Set(["ar"]);

export function useUILanguage() {
  const [language, setLanguageState] = useState(() => {
    try { return window.localStorage.getItem(LANG_KEY) || "en"; } catch (e) { return "en"; }
  });

  useEffect(() => {
    const dir = RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
    i18n.changeLanguage(language);
  }, [language]);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    try { window.localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
  }, []);

  return { language, setLanguage, isRTL: RTL_LANGUAGES.has(language) };
}
