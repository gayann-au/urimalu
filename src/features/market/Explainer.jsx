import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { useUriMotion } from "../../lib/uiMotion";

// The "what is this number" disclosure that sits on every card.
//
// A DISCLOSURE, NOT A TOOLTIP. It opens on tap and stays open until tapped
// again. Nothing here is bound to hover, because hover does not exist on the
// phone this is read on: a hover tooltip on a touch device is content that
// some readers can never open at all.
//
// WHAT MAY GO IN ONE. A sentence saying what the number is. Never a sentence
// saying what to do about it. "This is the rate the planters' association
// published" is an explanation; "this is a good time to sell" is advice, and
// advice is the one thing this feature does not ship. The strings live in the
// language files, so that line is held by review of the copy rather than by
// anything in this file.
//
// It is closed on first render every time. Nothing is remembered between
// visits: a farmer who needs the sentence once may need it again, and a
// disclosure that hides itself permanently after one read is a disclosure the
// next reader on the same phone never sees.
//
// SPLIT INTO PARTS on purpose. On a compact card the question mark belongs up
// beside the label and the panel belongs underneath the number, which are not
// siblings. useExplainer holds the state so the two halves can be placed
// independently; Explainer below is the convenience wrapper for the section
// headings, where they do sit together.

function QuestionMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/>
      <path d="M12 17h.01"/>
    </svg>
  );
}

export function useExplainer() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return { open, panelId, toggle: () => setOpen((v) => !v) };
}

export function ExplainerButton({ open, panelId, toggle, labelKey = "market.explain.open" }) {
  const { t } = useTranslation();
  return (
    // 44px of tap target around a 24px dot, because the visible circle is
    // sized to stay quiet beside the number and a farmer's thumb is not. The
    // negative margin keeps that padding from pushing the card open.
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={t(labelKey)}
      className="-m-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full"
    >
      <span
        className={`grid h-6 w-6 place-items-center rounded-full border transition-colors ${
          open
            ? "border-chilli-600 bg-chilli-600 text-white"
            : "border-chilli-200 bg-chilli-50 text-chilli-700"
        }`}
      >
        <QuestionMark/>
      </span>
    </button>
  );
}

// extra is the provenance line. The stored unit token used to sit on the card
// face beside its plain-words gloss, which meant every card printed its unit
// twice and the raw token, "INR/50kg", earned none of that space for a reader
// with limited schooling. It moved in here: out of the way, still on record,
// so the exact unit the source published is never lost.
export function ExplainerPanel({ open, panelId, bodyKey, extra }) {
  const { t } = useTranslation();
  const m = useUriMotion();

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={panelId}
          // Height animation so the card grows rather than jumping, which
          // matters most on the board where cards share a grid row. Collapses
          // to a plain fade under prefers-reduced-motion, the same rule every
          // variant in uiMotion.js follows.
          initial={m.reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={m.reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          exit={m.reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
          // w-full matters when the trigger sits in a wrapping flex row beside
          // a heading: basis-full drops the panel onto its own line under the
          // heading instead of squeezing in beside it.
          className="w-full overflow-hidden"
        >
          {/* paper-2 and ink-700, the same neutrals the flagged note uses. No
              warning colour and no accent fill: this is context, not an alert,
              and nothing in it says anything about the number being good or
              bad. */}
          <div className="mt-2 rounded-xl bg-paper-2 p-3 text-xs leading-relaxed text-ink-700">
            <p>{t(bodyKey)}</p>
            {extra && <p className="mt-2 text-ink-500">{extra}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Explainer({ bodyKey, extra, labelKey }) {
  const state = useExplainer();
  return (
    <>
      <ExplainerButton {...state} labelKey={labelKey}/>
      <ExplainerPanel {...state} bodyKey={bodyKey} extra={extra}/>
    </>
  );
}
