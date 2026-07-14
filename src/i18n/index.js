import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import kn from "./kn.json";

// Language persistence contract:
// - localStorage is the single source of truth and is checked first on every
//   load, so a returning user always gets the language they last chose.
// - The default is Kannada, used only when the user has never chosen. The app
//   never changes the language on its own; it changes only when the user
//   explicitly switches it, which saves the choice in setLanguage below.
const LANG_KEY = "coorgrate.lang";
const DEFAULT_LANG = "en";
const SUPPORTED = ["kn", "en"];

function readStoredLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, kn: { translation: kn } },
    lng: readStoredLang(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

// Persist the user's choice first, then switch the live language. Saving before
// changing means a reload always reflects the latest explicit choice.
export function setLanguage(lng) {
  if (!SUPPORTED.includes(lng)) return;
  try { localStorage.setItem(LANG_KEY, lng); } catch {}
  i18n.changeLanguage(lng);
}

export default i18n;