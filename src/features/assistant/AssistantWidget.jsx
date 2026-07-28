import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "../auth/useAuth";
import { useUiStore } from "../../hooks/useUiStore";
import { URI_EASE } from "../../lib/uiMotion";
import { useAssistant } from "./useAssistant";

// The chat panel for the shared, role-aware assistant. Mounted once for
// signed-in farmers and merchants (see routes.jsx). Uses only existing design
// tokens (chilli/crop/ember/ink/paper) and the shared URI_EASE motion curve.
//
// This component no longer owns the way in. The launcher lives in the shared
// header (see AssistantButton in Header.jsx) so it sits in the same place on
// every page, and open/closed is held in useUiStore where both can reach it.
//
// This is a farming assistant, not an in-app help bot. It answers general
// agriculture questions as readily as questions about Urimalu itself, so the
// copy below deliberately never frames it as help with the app.
//
// The assistant is ENGLISH ONLY for now, so the copy here is intentionally not
// routed through i18next. Everything else in the app stays bilingual; only this
// widget's own strings are fixed to English until the assistant is translated.
const COPY = {
  title: "Urimalu AI",
  subtitle: "Crop prices, markets and farming",
  placeholder: "Ask about a crop price...",
  intro: "Ask about prices, crops, or farming in general. If I do not know, I will say so.",
  send: "Send",
  thinking: "Thinking",
  esc: "Esc",
  errorReply: "Sorry, something went wrong. Please try again in a moment.",
  close: "Close assistant",
  disclaimer: "Urimalu AI can make mistakes. Check anything important before you act.",
};

// One suggestion per answer tier, in tier order: a general farming question the
// model answers from its own knowledge, a price question that has to hit live
// listings, and an app question answered from the guide. Three is the whole
// list on purpose. A longer menu would read as a command palette and would hide
// the fact that anything at all can be typed.
const SUGGESTIONS = {
  FARMER: [
    "Why do coffee prices change through the year?",
    "What is today's Robusta Cherry price?",
    "How do I set a price alert?",
  ],
  MERCHANT: [
    "What moves pepper prices globally?",
    "What are other merchants paying for Arabica?",
    "How do seller leads work?",
  ],
};

// Where an answer came from, printed under the assistant's own messages. Only
// the three tiers that make a claim about their footing are stamped: grounded
// listings, the written guide, and the model's own knowledge. Every other
// source value (nolistings, lookupfail, smalltalk, blocked, error) is absent
// from this map on purpose, so nothing is stamped for them. A source the
// backend has not sent, or one this map does not know, also prints nothing:
// silence is the only honest default when the tier is unknown.
const SOURCE_STAMP = {
  data: "From live Urimalu listings",
  knowledge: "From the Urimalu guide",
  general: "General knowledge, not Urimalu data",
};

const DESKTOP_QUERY = "(min-width: 640px)";

// How much the visible area has to shrink before we call it a keyboard rather
// than browser chrome sliding away. A URL bar is worth roughly 50 to 90px; no
// software keyboard is anywhere near as short as 140.
const KEYBOARD_THRESHOLD_PX = 140;

// Measures the part of the screen the user can actually see.
//
// iOS Safari never resizes the layout viewport when the software keyboard
// opens. Only the visual viewport shrinks. Since `fixed inset-0` and every `vh`
// unit are both measured against the layout viewport, a shell built from them
// keeps its full height with the keyboard up and everything pinned to its
// bottom edge, the composer included, sits behind the keyboard. The same gap
// explains the sliced header: on iOS the layout viewport also extends behind
// the browser's own chrome, so the top of a full height panel is simply not on
// screen. Neither symptom is reachable from CSS. `dvh` follows browser chrome
// but ignores the keyboard, and the `interactive-widget` viewport property is
// Chrome only.
//
// `offsetTop` is how far the visual viewport has scrolled down inside the
// layout viewport. A fixed element stays pinned to the layout viewport while
// that happens, so it has to be pushed down by the same amount to stay put.
//
// `keyboardOpen` calibrates against the tallest measurement taken since the
// panel opened rather than against `window.innerHeight`, whose relationship to
// the visual viewport differs between iOS versions. The tallest reading is the
// keyboard-shut state by definition.
//
// Returns null when disabled or when the API is missing, and null is load
// bearing: it means the caller writes no inline styles at all and the
// stylesheet's own `inset-0` governs, exactly as it did before this hook
// existed.
function useVisualViewport(enabled) {
  const [rect, setRect] = useState(null);
  const tallestRef = useRef(0);

  useLayoutEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!enabled || !vv) {
      setRect(null);
      return;
    }
    tallestRef.current = 0;
    function read() {
      tallestRef.current = Math.max(tallestRef.current, vv.height);
      setRect({
        height: vv.height,
        offsetTop: vv.offsetTop,
        keyboardOpen: tallestRef.current - vv.height > KEYBOARD_THRESHOLD_PX,
      });
    }
    read();
    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    return () => {
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, [enabled]);

  return rect;
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18"/>
      <path d="M6 6l12 12"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13"/>
      <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
    </svg>
  );
}

// The panel's own sparkle. Same four point glyph and stroke weight as
// SparkleIcon in Header.jsx so the launcher and the thing it opens read as one
// object, but centred in the viewBox and without the small trailing spark,
// because here it sits alone inside a 38px tile rather than beside a label.
function PanelSparkleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3z"/>
    </svg>
  );
}

// A single chat bubble. User messages sit right in crop green; assistant
// messages sit left on a warm paper surface. Assistant messages also carry the
// source stamp underneath, when the tier they came from has one. The user's own
// messages never do: the stamp describes where an answer was sourced, and the
// question was not sourced from anywhere.
function Bubble({ from, text, source }) {
  const isUser = from === "user";
  const stamp = isUser ? undefined : SOURCE_STAMP[source];
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-crop-600 text-white rounded-br-md"
            : "bg-paper-2 text-ink-800 rounded-bl-md"
        }`}
      >
        {text}
      </div>
      {stamp && <p className="pt-1 px-1 text-[11px] text-ink-500">{stamp}</p>}
    </div>
  );
}

// Shown while an answer is in flight. The label is "Thinking" and nothing more
// specific: which tier will answer is decided server side and is not known
// until the reply lands, so anything like "checking listings" would be a guess
// printed as a fact. Under reduced motion the bar stops sweeping and simply
// sits there filled.
function ThinkingBubble({ reduce }) {
  return (
    <div className="flex justify-start">
      <div className="bg-paper-2 rounded-2xl rounded-bl-md px-3.5 py-3 inline-flex items-center gap-3">
        <div className="relative h-[2px] w-16 overflow-hidden rounded-full bg-ink-200">
          {reduce ? (
            <div className="absolute inset-0 bg-gradient-to-r from-chilli-600 to-ember-500"/>
          ) : (
            <motion.div
              className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-chilli-600 to-ember-500"
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ duration: 1.1, ease: URI_EASE, repeat: Infinity }}
            />
          )}
        </div>
        <span className="text-ink-500 text-sm">{COPY.thinking}</span>
      </div>
    </div>
  );
}

// The opening screen, before anything has been asked. One plain line about
// scope, then the three starters. Tapping a starter sends it exactly as if it
// had been typed, so the first answer teaches the same lesson a typed question
// would: this thing takes sentences.
function EmptyState({ suggestions, onPick, disabled }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-ink-700 leading-relaxed">{COPY.intro}</p>
      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            disabled={disabled}
            className="w-full min-h-[48px] rounded-2xl bg-card border border-ink-200 px-4 py-3 text-left text-sm text-ink-800 hover:border-chilli-300 hover:bg-chilli-50 disabled:opacity-50 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Panel({ onClose, role }) {
  const assistant = useAssistant();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const reduce = useReducedMotion();

  // Read once at mount rather than on every render. This decides both the
  // entrance (slide up from the bottom edge on a phone, plain fade and scale
  // when the panel is centred) and whether the input is focused, and neither
  // should flip mid-life if the window is dragged across the breakpoint.
  const [isDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches
  );

  // Phones only. On a desktop the hook is inert and returns null, so the shell
  // below gets no inline styles and resolves through the identical CSS it used
  // before any of this existed. That is deliberate: desktop is not a second
  // layout, it is this layout with the measuring switched off.
  const viewport = useVisualViewport(!isDesktop);

  // `bottom: auto` is required because `inset-0` has already set both edges,
  // and a top plus a height cannot win against that on its own.
  const shellStyle = viewport
    ? { top: viewport.offsetTop, height: viewport.height, bottom: "auto" }
    : undefined;

  const suggestions = SUGGESTIONS[role] || SUGGESTIONS.FARMER;

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, assistant.isPending]);

  // Escape closes. The listener is added and removed with the panel itself
  // rather than living in the store, so there is nothing listening while the
  // assistant is shut.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Freeze the page behind the scrim. The previous value is captured and put
  // back rather than cleared, so a page that had already set its own overflow
  // gets that setting returned to it instead of an empty string.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Focus the input on a wide screen only. On a phone, focusing it raises the
  // software keyboard the instant the panel opens, which covers most of what
  // just slid into view.
  useEffect(() => {
    if (isDesktop) inputRef.current?.focus();
  }, [isDesktop]);

  function send(raw) {
    const text = String(raw || "").trim();
    if (!text || assistant.isPending) return;
    setMessages((prev) => [...prev, { from: "user", text }]);
    setInput("");
    // `source` is stored and shown. The stamp was held back while the Edge
    // Function returned "data" both when a live listing was found and when a
    // crop was recognised but nothing matched, because the second case was
    // general reasoning wearing a listings label. The backend now separates
    // those into "data", "nolistings" and "lookupfail", so the stamp is back
    // and only the grounded tier claims to be grounded.
    assistant.mutate(text, {
      onSuccess: (data) => {
        setMessages((prev) => [...prev, { from: "bot", text: data.reply, source: data.source }]);
      },
      onError: () => {
        setMessages((prev) => [...prev, { from: "bot", text: COPY.errorReply, source: "error" }]);
      },
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    send(input);
  }

  const entrance = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : isDesktop
      ? { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 } }
      : { initial: { opacity: 0, y: "100%" }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: "100%" } };

  return (
    // The flex wrapper does the centring so that framer-motion owns the panel's
    // transform outright. Positioning the panel with a translate utility and
    // then animating scale on the same element would put the two in a fight
    // that the inline transform always wins.
    //
    // It is also the only thing the measured viewport writes to, for the same
    // reason: the panel's transform is spoken for, and the shell's is not.
    <div style={shellStyle} className="fixed inset-0 z-50 flex items-end justify-center sm:items-center pointer-events-none">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={COPY.title}
        className="pointer-events-auto relative bg-paper border border-ink-200 shadow-2xl flex flex-col overflow-hidden
                   w-full h-full rounded-t-3xl
                   sm:w-[min(720px,92vw)] sm:h-[min(780px,86vh)] sm:rounded-3xl"
        initial={entrance.initial}
        animate={entrance.animate}
        exit={entrance.exit}
        transition={{ duration: 0.28, ease: URI_EASE }}
      >
        {/* Brand strip along the very top edge. Decorative. */}
        <div aria-hidden="true" className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-chilli-600 to-ember-500"/>

        {/* Grab bar, phone only. Decorative: the panel is not draggable, this
            just says which edge it came from. */}
        <div aria-hidden="true" className="pt-2.5 pb-1 flex justify-center sm:hidden">
          <div className="h-1 w-[38px] rounded-full bg-ink-300"/>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-100">
          <div className="h-[38px] w-[38px] shrink-0 rounded-xl bg-gradient-to-br from-chilli-600 to-ember-500 text-white inline-flex items-center justify-center">
            <PanelSparkleIcon/>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display font-extrabold text-lg text-ink-900 truncate">{COPY.title}</div>
            <div className="text-[11px] text-ink-500 truncate">{COPY.subtitle}</div>
          </div>
          <span className="hidden sm:inline-flex items-center rounded-md border border-ink-200 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-500 shrink-0">
            {COPY.esc}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={COPY.close}
            className="h-10 w-10 rounded-full text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors inline-flex items-center justify-center shrink-0"
          >
            <CloseIcon/>
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {messages.length === 0 ? (
            <EmptyState suggestions={suggestions} onPick={send} disabled={assistant.isPending}/>
          ) : (
            messages.map((m, i) => (
              <Bubble key={i} from={m.from} text={m.text} source={m.source}/>
            ))
          )}
          {assistant.isPending && <ThinkingBubble reduce={reduce}/>}
        </div>

        {/* Composer */}
        <div className="border-t border-ink-100 p-3">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={COPY.placeholder}
              aria-label={COPY.placeholder}
              maxLength={1000}
              className="flex-1 min-h-[44px] rounded-[14px] border border-ink-200 bg-card px-3.5 text-sm text-ink-800 placeholder:text-ink-300 focus:outline-none focus:border-crop-500 focus:ring-2 focus:ring-crop-100 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || assistant.isPending}
              aria-label={COPY.send}
              className="h-11 w-11 shrink-0 rounded-[14px] bg-crop-600 text-white inline-flex items-center justify-center hover:bg-crop-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <SendIcon/>
            </button>
          </form>

          {/* Always on, never dismissible. It states the fact and the action
              and stops there, leaving the reader to draw their own conclusion.
              It deliberately does not name particular failure modes: listing
              them here would read as a warning label at the moment of use, and
              a specific caution belongs inside the individual answer it
              applies to rather than in a permanent banner. */}
          <p className="pt-2 text-[11px] text-ink-500 text-center leading-relaxed">
            {COPY.disclaimer}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// Public component. Renders nothing for logged-out visitors and admins; the
// assistant is the shared farmer/merchant helper. Portalled to document.body so
// it floats above the app regardless of the current page's stacking context.
//
// Open state comes from useUiStore rather than local state, because the button
// that sets it now lives in the header. The eligibility test below is the same
// one the header applies before rendering that button.
export default function AssistantWidget() {
  const { profile } = useAuth();
  const open = useUiStore((s) => s.assistantOpen);
  const closeAssistant = useUiStore((s) => s.closeAssistant);

  const eligible = profile && (profile.role === "FARMER" || profile.role === "MERCHANT");

  // Open state outlives this component now that it sits in the store, so a
  // panel left open at logout would still be open for whoever signs in next
  // during the same page session. Closing it the moment the viewer stops being
  // eligible restores what the old local useState gave us for free.
  //
  // This has to run before the early return below: React counts hooks per
  // render, and a hook placed after a conditional return would be skipped on
  // the renders that take it.
  useEffect(() => {
    if (!eligible && open) closeAssistant();
  }, [eligible, open, closeAssistant]);

  if (!eligible) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="assistant-scrim"
            aria-hidden="true"
            onClick={closeAssistant}
            className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: URI_EASE }}
          />
          <Panel key="assistant-panel" onClose={closeAssistant} role={profile.role}/>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
