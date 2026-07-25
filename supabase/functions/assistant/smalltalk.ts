// Small-talk shortcut: greetings, thanks, and goodbyes get an instant canned
// reply with ZERO Groq calls. Only genuine questions ever reach the model, so
// casual chatter never burns the shared free-tier quota.
//
// Detection is deliberately strict: a message counts as small talk only when,
// after stripping punctuation, the WHOLE message is a known phrase (optionally
// with a leading filler word). "hi" is small talk; "hi, what is the pepper
// price" is not, because it carries a real question.

import type { Role } from "./types.ts";

// Normalise for matching: lowercase, strip punctuation to spaces, collapse
// runs of whitespace. Keeps letters and spaces only.
function normalise(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Whole-message phrases, grouped by the canned reply they trigger. Includes a
// few common romanised Kannada greetings (namaskara, dhanyavada) since the app
// serves Kannada speakers even though the assistant replies in English for now.
const GREETINGS = new Set([
  "hi", "hii", "hello", "hey", "hey there", "hello there", "yo",
  "good morning", "good afternoon", "good evening",
  "namaste", "namaskara", "namaskar", "vanakkam",
  "hi there", "hello urimalu", "hi urimalu",
]);

const THANKS = new Set([
  "thanks", "thank you", "thanks a lot", "thank you so much", "ty", "thx",
  "great thanks", "ok thanks", "okay thanks", "thanks urimalu",
  "dhanyavada", "dhanyavadagalu", "nanri",
]);

const BYES = new Set([
  "bye", "goodbye", "bye bye", "see you", "see ya", "good night",
  "ok bye", "okay bye", "thanks bye", "cya",
]);

// A short list of leading filler words a real message might start with before
// the greeting proper (e.g. "ok hi", "well hello"). Stripped before matching so
// those still register as small talk.
const LEADING_FILLERS = new Set(["ok", "okay", "so", "well", "um", "hmm"]);

function stripLeadingFiller(text: string): string {
  const parts = text.split(" ");
  if (parts.length > 1 && LEADING_FILLERS.has(parts[0])) {
    return parts.slice(1).join(" ");
  }
  return text;
}

export type SmallTalkKind = "greeting" | "thanks" | "bye";

// Returns the small-talk kind when the entire message is casual chatter, or
// null when it carries something to actually answer.
export function detectSmallTalk(message: string): SmallTalkKind | null {
  const norm = stripLeadingFiller(normalise(message));
  if (!norm) return null;
  if (GREETINGS.has(norm)) return "greeting";
  if (THANKS.has(norm)) return "thanks";
  if (BYES.has(norm)) return "bye";
  return null;
}

// Canned, role-aware replies. Farmers are steered toward asking about prices;
// merchants toward the markets and how the app works. English only for now.
export function smallTalkReply(kind: SmallTalkKind, role: Role): string {
  if (kind === "thanks") return "You are welcome. Ask me anything else about crop prices whenever you need.";
  if (kind === "bye") return "Goodbye, and happy trading. Come back any time for the latest prices.";

  // greeting
  if (role === "MERCHANT") {
    return "Hello! I can help you understand current crop prices across the markets, or answer questions about how Urimalu works. What would you like to know?";
  }
  return "Hello! I can look up the latest crop prices from merchants and answer questions about how Urimalu works. What crop are you interested in?";
}
