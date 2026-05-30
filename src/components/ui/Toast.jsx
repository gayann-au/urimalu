import { create } from "zustand";
import { useEffect } from "react";

export const useToastStore = create((set) => ({
  toasts: [],
  push: (toast) => {
    const id = Math.random().toString(36).slice(2);
    const t = { id, tone: "ok", duration: 3000, ...toast };
    set((s) => ({ toasts: [...s.toasts, t] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter(x => x.id !== id) })), t.duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter(x => x.id !== id) })),
}));

export function toast(opts) {
  return useToastStore.getState().push(typeof opts === "string" ? { text: opts } : opts);
}

export function ToastViewport() {
  const toasts = useToastStore(s => s.toasts);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {}, []);
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`pointer-events-auto px-5 py-3 rounded-full shadow-lg text-sm font-semibold max-w-[calc(100vw-32px)] text-center ${
            t.tone === "ok" ? "bg-coorg-700 text-white" :
            t.tone === "err" ? "bg-red-600 text-white" :
            "bg-gray-800 text-white"
          }`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}