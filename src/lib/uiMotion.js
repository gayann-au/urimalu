import { useReducedMotion } from "framer-motion";

// Shared motion config so every page outside the landing reuses the exact same
// values that the landing page uses. Values are copied verbatim from the
// landing design system: ease curve, fadeUp, stagger, popIn, slideInRight, and
// the spring-based hover and tap reactions. When the visitor prefers reduced
// motion every travel and scale offset collapses to a plain fade.
export const URI_EASE = [0.22, 0.61, 0.36, 1];

export function useUriMotion() {
  const reduce = useReducedMotion();
  return {
    reduce,
    fadeUp: {
      hidden: { opacity: 0, y: reduce ? 0 : 22 },
      show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: URI_EASE } },
    },
    stagger: {
      hidden: {},
      show: { transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.05 } },
    },
    popIn: {
      hidden: { opacity: 0, y: reduce ? 0 : 30, scale: reduce ? 1 : 0.98 },
      show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: URI_EASE } },
    },
    slideInRight: {
      hidden: { opacity: 0, x: reduce ? 0 : 48, scale: reduce ? 1 : 0.97 },
      show: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.75, ease: URI_EASE, delay: reduce ? 0 : 0.12 } },
    },
    cardHover: reduce ? undefined : { y: -6, transition: { type: "spring", stiffness: 320, damping: 22 } },
    btnHover: reduce ? undefined : { y: -2, transition: { type: "spring", stiffness: 420, damping: 18 } },
    btnTap: reduce ? undefined : { scale: 0.97 },
    inView: { once: true, amount: 0.2 },
  };
}
