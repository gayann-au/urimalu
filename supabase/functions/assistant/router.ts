// Routing. Decides WHICH tier answers a message, from what the user is asking
// for rather than from which words they happened to use.
//
// The three tiers are not equal. Two are narrow and can only answer out of
// something they hold:
//
//   data       current listing prices for the four traded crops
//   knowledge  hand written facts about how Urimalu works (knowledge.ts)
//   general    the model's own knowledge, allowed to answer broadly about
//              farming
//
// THE RULE THIS FILE EXISTS TO ENFORCE
// A narrow tier is entered only on positive evidence that it holds the answer.
// Everything else reaches the general tier.
//
// The routing this replaces did the opposite. It sent a message to the data
// tier because the token "coffee" appeared somewhere in it, so the first
// suggestion chip a new user taps, "What happens to a coffee bean between the
// tree and your cup?", came back as a wall of live prices. Each new failure
// was then patched with another exception pattern, and a blocklist over
// natural language can never be finished.
//
// WHY THE EVIDENCE LISTS ARE ALLOWLISTS
// APP_TERMS and the shape patterns below are positive evidence, not filters.
// That direction is the whole point. A term missing from them sends the
// message to the general tier, which is allowed to answer anything about
// farming. A term missing from a blocklist produced a confidently wrong narrow
// answer. Incompleteness now degrades toward the tier that can cope.
//
// FALLTHROUGH (Layer C)
// Every point where the evidence turns out to be missing hands the message to
// the general tier instead of answering anyway. All of those checks run BEFORE
// any model call, so handing back costs zero extra Groq calls. See the tier
// decision at the bottom of routeMessage.

import { detectIntent, hasPriceIntent } from "./intent.ts";
import type { Intent } from "./intent.ts";
import { findSection } from "./knowledge.ts";
import type { KnowledgeSection } from "./knowledge.ts";

// What the user wants, independent of whether we can supply it.
//   price    a current number for a crop
//   app      how Urimalu itself works
//   farming  growing, treating or understanding a crop
//   other    chat, jokes, gibberish, anything else
export type AskType = "price" | "app" | "farming" | "other";

// Which tier will answer.
export type Tier = "data" | "knowledge" | "general";

export interface Route {
  tier: Tier;
  ask: AskType;
  intent: Intent;
  // The section the knowledge tier will answer from. Non-null only when the
  // ask is "app"; kept on the route so the log can record it either way.
  section: KnowledgeSection | null;
  sectionId: string | null;
  // The user wants a price but named no crop, so the general tier should ask
  // which crop they mean. The only remaining consumer of price intent.
  priceWithoutCrop: boolean;
}

// Things that exist only inside Urimalu. Naming one of these is the clearest
// evidence a message is about the app rather than about farming, and it holds
// even when the message also contains price words: "how do I set a price
// alert" is not a request for a price.
//
// Deliberately excludes words a genuine price question would also use.
// "district" was tried here and removed, because "what are merchants paying in
// my district" is a price question.
const APP_TERMS =
  /\b(urimalu|app|apps|sign ?up|register|registration|login|log ?in|sign ?in|log ?out|password|passwords|my account|profile|verified|verification|approved|approval|pending|resubmit|badge|alert|alerts|notification|notifications|confirm|confirmed|call for price|price history|ready to sell|feature request|feedback|terms|privacy|kannada|english|feed)\b/i;

// How-to phrasing. On its own this means nothing: "how do I grow tomatoes" is
// a farming question. It counts as app evidence only when the message is not
// about growing something, which is what AGRONOMY_SHAPE below rules out.
const HOW_TO_SHAPE =
  /how do i|how do you|how to|how does|how can i|where do i|where can i|can i|do i need to|what happens when/i;

// Growing, treating or understanding a crop. Used for two things: to stop a
// farming how-to being read as an app how-to, and to label the ask for the log.
//
// Note what is NOT here: the bare words "crop" and "crops". They belong to
// both worlds. "How do I add my crops" is an app question and "how do I grow
// my crops" is a farming one, so the distinguishing word has to be the verb.
const AGRONOMY_SHAPE =
  /\b(grow|grows|growing|grew|plant|plants|planting|planted|sow|sowing|sown|soil|water|watering|irrigate|irrigation|fertilis\w*|fertiliz\w*|manure|compost|pest|pests|insect|insects|disease|diseases|fungus|fungal|spray|sprays|spraying|prune|pruning|harvest|harvesting|harvested|yield|yields|seed|seeds|seedling|sapling|variety|varieties|weather|rain|rainfall|monsoon|shade|weed|weeds|cultivat\w*|farm|farms|farming|farmer|farmers|acre|acres|estate)\b/i;

// Asking why or when something happens, or for an explanation. Never a request
// for a current number, even when price words are present: "why are coffee
// prices falling" wants a reason, and the listings table holds no reasons.
//
// Deliberately excludes a bare "how", because "how much" is a figure request.
const EXPLAIN_SHAPE =
  /\b(why|how come|what causes|explain|what happens)\b|\bwhen (is|are|do|does|did|should|will)\b/i;

// A message that is essentially just a crop name ("pepper?", "arabica") is a
// price question. It is the shortest thing a farmer types and it has always
// meant "show me what this is fetching".
//
// Guarded two ways: at most three words, and not opening with a question word,
// so "is coffee good" and "why coffee" are not swept up.
function isBareCrop(message: string, cropNamed: boolean): boolean {
  if (!cropNamed) return false;
  const words = message.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/);
  if (words.length === 0 || words[0] === "" || words.length > 3) return false;
  return !/^(what|why|how|when|where|who|which|is|are|do|does|did|can|should)$/.test(words[0]);
}

// Classify what the user is asking for. Knows nothing about whether we hold an
// answer; that is the tier decision's job, below.
//
// Order is precedence, and app comes first on purpose. An app question is
// allowed to contain price words, because the app is largely about prices.
// A price question is not allowed to contain app-only vocabulary.
export function classifyAsk(message: string, cropNamed: boolean): AskType {
  const agronomy = AGRONOMY_SHAPE.test(message);

  if (APP_TERMS.test(message)) return "app";
  if (HOW_TO_SHAPE.test(message) && !agronomy) return "app";

  if (!EXPLAIN_SHAPE.test(message)) {
    if (isBareCrop(message, cropNamed)) return "price";
    if (hasPriceIntent(message, cropNamed)) return "price";
  }

  if (agronomy || cropNamed) return "farming";
  return "other";
}

// Decide the tier for one message. Pure and synchronous: no database and no
// model call, so it is cheap to run and cheap to test.
export function routeMessage(message: string): Route {
  const intent = detectIntent(message);
  const cropNamed = intent.crop !== null;
  const ask = classifyAsk(message, cropNamed);

  // Only looked up when it could matter. findSection is pure string work, but
  // there is no reason to scan the knowledge base for a price question.
  const section = ask === "app" ? findSection(message) : null;

  // Layer C, the fallthrough. Each narrow tier is entered only if the thing it
  // answers from is actually there:
  //   price ask, no crop     -> general, which asks which crop they mean
  //   app ask, no section    -> general, rather than an invented app answer
  // Both are decided here, before any model call, so a handback is free.
  let tier: Tier = "general";
  if (ask === "price" && intent.crop) {
    tier = "data";
  } else if (ask === "app" && section) {
    tier = "knowledge";
  }

  return {
    tier,
    ask,
    intent,
    section,
    sectionId: section?.id ?? null,
    priceWithoutCrop: ask === "price" && !intent.crop,
  };
}
