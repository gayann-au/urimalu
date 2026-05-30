import { create } from "zustand";
import i18n, { setLanguage } from "../i18n";

export const useUiStore = create((set, get) => ({
  lang: i18n.language || "kn",
  setLang: (lng) => { setLanguage(lng); set({ lang: lng }); },
  toggleLang: () => {
    const next = get().lang === "kn" ? "en" : "kn";
    setLanguage(next); set({ lang: next });
  },
  newRatesCount: 0,
  incNewRates: () => set((s) => ({ newRatesCount: s.newRatesCount + 1 })),
  clearNewRates: () => set({ newRatesCount: 0 }),
}));