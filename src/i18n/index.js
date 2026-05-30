import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import kn from "./kn.json";

const initial = (() => {
  try { return localStorage.getItem("coorgrate.lang") || "kn"; } catch { return "kn"; }
})();

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, kn: { translation: kn } },
    lng: initial,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export function setLanguage(lng) {
  try { localStorage.setItem("coorgrate.lang", lng); } catch {}
  i18n.changeLanguage(lng);
}

export default i18n;