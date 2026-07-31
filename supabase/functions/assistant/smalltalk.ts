// Small-talk shortcut: greetings, thanks, goodbyes, status checks, plain
// acknowledgements and obvious junk get an instant canned reply with ZERO model
// calls. Only genuine questions ever reach the model, so casual chatter never
// burns the shared free-tier quota.
//
// Detection is deliberately strict: a message counts as small talk only when,
// after stripping punctuation, the WHOLE message is a known phrase (optionally
// with a leading filler word). "hi" is small talk; "hi, what is the pepper
// price" is not, because it carries a real question.
//
// Replies are picked at random from a short list so the same visitor does not
// see the identical sentence twice. Still zero tokens.

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

// "How are you" style. Costs a full model call today for no useful answer.
const STATUS = new Set([
  "how are you", "how are you doing", "how r u", "how are u",
  "hi how are you", "hello how are you", "hows it going", "how is it going",
  "whats up", "wassup", "sup", "you good", "are you fine", "how do you do",
]);

// Plain acknowledgements that carry no question at all.
const ACKS = new Set([
  "ok", "okay", "k", "kk", "fine", "good", "nice", "cool", "great",
  "all good", "im good", "i am good", "good so far", "sounds good",
  "alright", "right", "sure", "yeah", "yep", "nope",
  "got it", "understood", "hmm", "hm",
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

// Conservative junk detection. Deliberately misses some gibberish rather than
// ever blocking a real one-word crop question like "paddy" or "vanilla".
// Runs AFTER all phrase sets, so "hi", "yo" and "ok" are already claimed.
function isJunk(norm: string): boolean {
  // Nothing survived normalisation: "?", "123", "...", emoji only.
  if (!norm) return true;
  // Anything with a space is a real attempt at a sentence. Leave it alone.
  if (norm.includes(" ")) return false;
  // A single stray letter: "P". Two letters are left alone so the coffee
  // grade codes "EP" and "OT" still reach the model.
  if (norm.length <= 1) return true;
  // No vowel anywhere: "nsnnd", "hjsjs", "rjtyj", "bhjjjg", "xy".
  if (!/[aeiou]/.test(norm)) return true;
  // Four consonants in a row inside a short word: "bhzba", "ghrje".
  // Length capped at 6 so real words like "parchment" (rchm) are never hit.
  if (norm.length <= 6 && /[^aeiou]{4}/.test(norm)) return true;
  return false;
}

export type SmallTalkKind =
  | "greeting"
  | "thanks"
  | "bye"
  | "status"
  | "ack"
  | "junk";

// Returns the small-talk kind when the entire message is casual chatter or
// junk, or null when it carries something to actually answer.
export function detectSmallTalk(message: string): SmallTalkKind | null {
  const norm = stripLeadingFiller(normalise(message));
  if (GREETINGS.has(norm)) return "greeting";
  if (THANKS.has(norm)) return "thanks";
  if (BYES.has(norm)) return "bye";
  if (STATUS.has(norm)) return "status";
  if (ACKS.has(norm)) return "ack";
  if (isJunk(norm)) return "junk";
  return null;
}

function pick(options: string[]): string {
  return options[Math.floor(Math.random() * options.length)];
}

// Canned, role-aware replies. Randomised so a visitor never sees the same line
// twice in a row. English only for now.
export function smallTalkReply(kind: SmallTalkKind, role: Role): string {
  const farmer = role !== "MERCHANT";

  if (kind === "greeting") {
    return farmer
      ? pick([
        "Hello. I can look up what merchants are paying today. Which crop?",
        "Hi there. Tell me a crop and I will find you the best price on it.",
        "Welcome. Coffee, pepper, cardamom or arecanut, what are we checking?",
        "Hello. Ask me a price, or ask me how Urimalu works. Either works.",
      ])
      : pick([
        "Hello. I can show you what the markets are paying, or explain how Urimalu works.",
        "Hi there. Looking at prices today, or something about the app?",
        "Welcome. Ask me about market prices, listings, or seller leads.",
        "Hello. What would you like to look at first?",
      ]);
  }

  if (kind === "thanks") {
    return pick([
      "Any time. Come back whenever you need a price.",
      "You are welcome. Ask me anything else whenever you need.",
      "Happy to help. Prices move, so check back often.",
      "My pleasure. I am here whenever you need me.",
    ]);
  }

  if (kind === "bye") {
    return pick([
      "Goodbye, and good luck out there.",
      "See you. Prices change daily, so drop in any time.",
      "Take care. Come back for the latest rates.",
      "Bye for now. Happy trading.",
    ]);
  }

  if (kind === "status") {
    return pick([
      "Doing well, thank you. More importantly, what crop can I look up for you?",
      "All good here. What can I find for you?",
      "Very well. Ask me a price and I will get to work.",
      "Good, thanks for asking. What are we looking at today?",
    ]);
  }

  if (kind === "ack") {
    return pick([
      "Anything else you want to know?",
      "Right. What next?",
      "Got it. Ask away whenever you are ready.",
      "Noted. What else can I look up?",
    ]);
  }

  // junk
  return pick([
    "That one lost me. Try asking about a crop price or about the app.",
    "Not sure what that was. Ask me a price and I will be much more useful.",
    "Did that send by accident? Ask me about coffee, pepper, cardamom or arecanut.",
    "I did not catch that. What crop are you interested in?",
  ]);
}
