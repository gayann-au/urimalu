// Rule-based guardrail layer. This is the SECOND half of the guardrail strategy
// (the first half is instructions baked into the system prompt in prompts.ts).
// It is plain pattern matching in code, NOT a second AI call, so it never spends
// Groq quota. It runs before the model on every real question.
//
// It has two jobs:
//   1. Block jailbreak / prompt-injection attempts (trying to override the
//      system prompt, extract it, or make the assistant role-play as something
//      else).
//   2. Keep the assistant on-topic and safe by refusing a small set of clearly
//      out-of-scope or unsafe categories with a canned redirect.
//
// Everything else passes through to the model. The goal is a light touch: catch
// obvious abuse, not police ordinary phrasing.

// A blocked check returns a reason so the caller can log why, plus the canned
// message shown to the user.
export interface GuardrailResult {
  blocked: boolean;
  reason?: string;
  reply?: string;
}

const PASS: GuardrailResult = { blocked: false };

// Prompt-injection / jailbreak signatures. Matched case-insensitively against
// the raw message. Kept specific so normal questions ("how do I ignore a bad
// review") are not caught by accident.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |your |the )?(previous|prior|earlier|above)\s+(instructions|prompts?|rules?)/i,
  /disregard (all |any |your |the )?(previous|prior|earlier|above)\s+(instructions|prompts?|rules?)/i,
  /forget (all |any |your |the )?(previous|prior|earlier|above)\s+(instructions|prompts?|rules?)/i,
  /(reveal|show|print|repeat|tell me)\s+(me\s+)?(your\s+)?(system\s+prompt|initial\s+instructions|the\s+prompt)/i,
  /what (is|are) your (system\s+)?(prompt|instructions)/i,
  /you are now\b/i,
  /act as (an?|the)\b.*\b(dan|jailbreak|unfiltered|uncensored)/i,
  /\bdeveloper mode\b/i,
  /pretend (you are|to be)\b.*\b(not|no longer)\b/i,
];

// Human medical advice. Every word here is also everyday farming vocabulary:
// a grower asks for the medicine for coffee borer, the dosage of a fungicide,
// the symptoms of leaf rust. Blocking on the bare word refused all of those.
// So this pattern only counts when nothing in the message places the question
// on a plant or an animal, see FARMING_CONTEXT_PATTERN below.
const MEDICAL_PATTERN =
  /\b(medical|medicine|medicines|dosage|symptom|symptoms|disease diagnosis|prescription)\b/i;

// Signals that a message using medical words is about a crop or an animal
// rather than a person. Any hit exempts the message from MEDICAL_PATTERN and
// lets it through to the model as an ordinary farming question.
const FARMING_CONTEXT_PATTERN =
  /\b(crop|crops|plant|plants|planting|tree|trees|leaf|leaves|root|roots|stem|stems|seed|seeds|seedling|sapling|soil|farm|farms|farming|farmer|farmers|field|fields|garden|orchard|estate|nursery|harvest|yield|pest|pests|insect|insects|borer|beetle|caterpillar|worm|worms|grub|mite|mites|aphid|aphids|fungus|fungal|fungicide|pesticide|insecticide|herbicide|spray|sprayed|spraying|blight|rust|wilt|rot|mildew|weed|weeds|manure|compost|fertiliser|fertilizer|irrigation|livestock|cattle|cow|cows|buffalo|goat|goats|sheep|poultry|chicken|chickens|hen|hens|coffee|arabica|robusta|pepper|cardamom|arecanut|areca|paddy|rice|tomato|tomatoes|banana|ginger|turmeric|coconut|maize|cotton|sugarcane|vegetable|vegetables|fruit|fruits)\b/i;

// Clearly out-of-scope or unsafe topics that no farming context can excuse.
// The assistant should decline to give legal or personalised financial and
// investment advice, and refuse obvious abuse. These are intentionally narrow
// so on-topic questions are never swept up.
const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\b(lawsuit|legal advice|sue|court case|attorney)\b/i,
  /\b(stock market|share market|mutual fund|cryptocurrency|bitcoin|forex)\b/i,
  /\b(write|generate|create)\b.*\b(malware|virus|exploit|phishing)\b/i,
];

const INJECTION_REPLY =
  "I am going to stay on the job here. Ask me anything about farming, crops, prices, listings, or how Urimalu works.";

const OUT_OF_SCOPE_REPLY =
  "That one is outside what I can help with. Farming of any kind, crop prices, market listings and how to use Urimalu are all fair game. What do you need?";

// Run the rule-based checks. Returns { blocked: true, ... } for anything that
// should never reach the model, otherwise the shared PASS object.
export function runGuardrails(message: string): GuardrailResult {
  const text = message.trim();
  if (!text) return PASS;

  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      return { blocked: true, reason: "prompt_injection", reply: INJECTION_REPLY };
    }
  }

  // Medical words only block when the message is not about a plant or animal.
  if (MEDICAL_PATTERN.test(text) && !FARMING_CONTEXT_PATTERN.test(text)) {
    return { blocked: true, reason: "out_of_scope", reply: OUT_OF_SCOPE_REPLY };
  }

  for (const re of OUT_OF_SCOPE_PATTERNS) {
    if (re.test(text)) {
      return { blocked: true, reason: "out_of_scope", reply: OUT_OF_SCOPE_REPLY };
    }
  }

  return PASS;
}
