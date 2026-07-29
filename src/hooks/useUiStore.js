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
  // Whether the assistant panel is showing. Lifted out of AssistantWidget so
  // the launch button can live in the shared header, on every page, while the
  // panel itself stays portalled where it always was.
  assistantOpen: false,
  openAssistant: () => set({ assistantOpen: true }),
  closeAssistant: () => set({ assistantOpen: false }),
}));