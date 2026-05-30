import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { queryClient } from "../lib/queryClient";
import { ToastViewport } from "../components/ui/Toast";

export function Providers({ children }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        {children}
        <ToastViewport/>
      </QueryClientProvider>
    </I18nextProvider>
  );
}