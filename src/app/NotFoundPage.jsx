import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Header } from "../components/layout/Header";
import { GlowBackdrop } from "../components/ui/GlowBackdrop";
import { Button } from "../components/ui/Button";
import { useUriMotion } from "../lib/uiMotion";

// Catch-all 404 page for any route that does not match. Styled with the app
// design tokens (crop, chilli, ink) and offering a clear way back home.
export default function NotFoundPage() {
  const { t } = useTranslation();
  const m = useUriMotion();
  return (
    <div className="flex flex-col flex-1 items-center isolate">
      <GlowBackdrop/>
      <Header/>
      <main className="w-full max-w-md px-5 py-16 flex-1 flex flex-col items-center text-center">
        <motion.div variants={m.stagger} initial="hidden" animate="show" className="flex flex-col items-center">
          <motion.div variants={m.fadeUp} className="h-16 w-16 rounded-2xl bg-crop-50 text-crop-600 grid place-items-center mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
          </motion.div>
          <motion.h1 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">
            {t("notFound.title")}
          </motion.h1>
          <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-2 max-w-xs">
            {t("notFound.body")}
          </motion.p>
          <motion.div variants={m.fadeUp} className="mt-7 w-full">
            <Link to="/">
              <Button size="lg" className="w-full">{t("notFound.home")}</Button>
            </Link>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
