import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../auth/useAuth";
import { URI_EASE } from "../../lib/uiMotion";
import { useAssistant } from "./useAssistant";

// Minimal frontend entry point for the shared, role-aware assistant: a floating
// launcher button that opens a small chat panel. Mounted once for signed-in
// farmers and merchants (see routes.jsx). Uses only existing design tokens
// (coorg/crop/ink/paper/chilli) and the shared URI_EASE motion curve.
//
// The assistant is ENGLISH ONLY for now, so the copy here is intentionally not
// routed through i18next. Everything else in the app stays bilingual; only this
// widget's own strings are fixed to English until the assistant is translated.
const COPY = {
  launcherLabel: "Ask Urimalu",
  title: "Urimalu Assistant",
  subtitle: "Crop prices and how the app works",
  placeholder: "Ask about a crop price...",
  intro: "Hi! Ask me about crop prices (coffee, pepper, cardamom, arecanut) or how Urimalu works.",
  send: "Send",
  errorReply: "Sorry, something went wrong. Please try again in a moment.",
  close: "Close assistant",
  open: "Open assistant",
};

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  );
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

// A single chat bubble. User messages sit right in coorg green; assistant
// messages sit left on a warm paper surface.
function Bubble({ from, text }) {
  const isUser = from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-coorg-600 text-white rounded-br-md"
            : "bg-paper-2 text-ink-800 rounded-bl-md"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

// Three-dot typing indicator shown while a Groq answer is in flight.
function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-paper-2 text-ink-500 rounded-2xl rounded-bl-md px-3.5 py-3 inline-flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-ink-300"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}

function Panel({ onClose }) {
  const assistant = useAssistant();
  const [messages, setMessages] = useState([{ from: "bot", text: COPY.intro }]);
  const [input, setInput] = useState("");
  const listRef = useRef(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, assistant.isPending]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || assistant.isPending) return;
    setMessages((prev) => [...prev, { from: "user", text }]);
    setInput("");
    assistant.mutate(text, {
      onSuccess: (data) => {
        setMessages((prev) => [...prev, { from: "bot", text: data.reply }]);
      },
      onError: () => {
        setMessages((prev) => [...prev, { from: "bot", text: COPY.errorReply }]);
      },
    });
  }

  return (
    <motion.div
      role="dialog"
      aria-label={COPY.title}
      className="fixed z-50 bg-white shadow-xl border border-ink-200 flex flex-col overflow-hidden
                 inset-x-0 bottom-0 rounded-t-3xl h-[80vh]
                 sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[380px] sm:h-[520px] sm:rounded-3xl"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.98 }}
      transition={{ duration: 0.28, ease: URI_EASE }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100 bg-[rgba(251,249,247,0.9)]">
        <div className="min-w-0">
          <div className="font-display font-extrabold text-base text-ink-900 truncate">{COPY.title}</div>
          <div className="text-[11px] text-ink-500 truncate">{COPY.subtitle}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={COPY.close}
          className="h-10 w-10 rounded-full text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors inline-flex items-center justify-center shrink-0"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.map((m, i) => (
          <Bubble key={i} from={m.from} text={m.text} />
        ))}
        {assistant.isPending && <TypingBubble />}
      </div>

      {/* Composer */}
      <form onSubmit={handleSubmit} className="border-t border-ink-100 p-3 flex items-end gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={COPY.placeholder}
          aria-label={COPY.placeholder}
          maxLength={1000}
          className="flex-1 min-h-[44px] rounded-[14px] border border-ink-200 bg-white px-3.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-coorg-500 focus:ring-2 focus:ring-coorg-100 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || assistant.isPending}
          aria-label={COPY.send}
          className="h-11 w-11 shrink-0 rounded-[14px] bg-coorg-600 text-white inline-flex items-center justify-center hover:bg-coorg-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.97]"
        >
          <SendIcon />
        </button>
      </form>
    </motion.div>
  );
}

// Public component. Renders nothing for logged-out visitors and admins; the
// assistant is the shared farmer/merchant helper. Portalled to document.body so
// it floats above the app regardless of the current page's stacking context.
export default function AssistantWidget() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);

  const eligible = profile && (profile.role === "FARMER" || profile.role === "MERCHANT");
  if (!eligible) return null;

  return createPortal(
    <>
      <AnimatePresence>
        {open && <Panel key="assistant-panel" onClose={() => setOpen(false)} />}
      </AnimatePresence>

      {/* Launcher: hidden while the panel is open so it never overlaps the
          full-height mobile sheet. */}
      {!open && (
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={COPY.open}
          className="fixed z-40 bottom-5 right-5 h-14 rounded-full bg-coorg-600 text-white shadow-lg inline-flex items-center gap-2 px-4 hover:bg-coorg-700 transition-colors"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: URI_EASE }}
          whileTap={{ scale: 0.96 }}
        >
          <ChatIcon />
          <span className="font-bold text-sm hidden sm:inline">{COPY.launcherLabel}</span>
        </motion.button>
      )}
    </>,
    document.body,
  );
}
