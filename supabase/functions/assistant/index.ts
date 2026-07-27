// Supabase Edge Function: assistant
//
// One shared, role-aware AI assistant for both farmers and merchants. Called
// from the browser via supabase.functions.invoke("assistant", { body }).
//
// Flow (cheapest path first, so Groq quota is only ever spent on real work):
//   1. Validate the request { message, role }.
//   2. Small-talk check -> instant canned reply, ZERO Groq calls.
//   3. Rule-based guardrail check -> canned refusal, ZERO Groq calls.
//   4. Intent detection:
//        - data path: extract crop/market/timeframe, run a read-only SELECT
//          against listings (or price_history), then have Groq phrase the exact
//          facts.
//        - general path: Groq answers from its own knowledge behind the same
//          guardrails.
//
// Secrets (set via the Supabase dashboard/CLI, NEVER committed):
//   GROQ_API_KEY   required; the Groq chat-completions key.
//   GROQ_MODEL     optional; defaults to a free-tier model (see llm.ts).
//   GROQ_MAX_RPM   optional; in-isolate burst limiter (see llm.ts).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "./cors.ts";
import { detectSmallTalk, smallTalkReply } from "./smalltalk.ts";
import { runGuardrails } from "./guardrails.ts";
import { detectIntent } from "./intent.ts";
import { lookupFacts } from "./listings.ts";
import { findSection } from "./knowledge.ts";
import { userIdFromRequest, logInteraction } from "./log.ts";
import { askModel, MissingKeyError, RateLimitError, LlmError } from "./llm.ts";
import { dataSystemPrompt, noDataSystemPrompt, generalSystemPrompt, knowledgeSystemPrompt } from "./prompts.ts";
import type { AssistantReply, Role } from "./types.ts";

const MAX_MESSAGE_LEN = 1000;

// Marks a question about how the app works, so it can outrank a crop name in
// routing. Deliberately not global: a /g regex keeps lastIndex between calls,
// so .test() would alternate true/false on the same message.
const HOW_TO_PATTERN =
  /how do i|how do you|how to|how does|how can i|where do i|where can i|do i need to|what happens when/i;

// What answerQuestion hands back internally. The extra two fields are for
// the log only and are stripped before the browser sees the response.
interface Answered extends AssistantReply {
  model?: string | null;
  tokensUsed?: number | null;
}

// Service-role client, same pattern as send-push. Used only for the read-only
// facts lookup; RLS is re-applied in the query filters regardless.
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Friendly, non-technical fallbacks. English only for now.
const BUSY_REPLY = "The assistant is busy right now because a lot of people are asking at once. Please try again in a minute.";
const ERROR_REPLY = "Sorry, I could not answer that just now. Please try again in a moment.";

// Validate and narrow the request body. Returns a typed request or an error
// string describing what was wrong.
function parseBody(body: unknown): { message: string; role: Role } | { error: string } {
  if (!body || typeof body !== "object") return { error: "missing body" };
  const b = body as Record<string, unknown>;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  const role = b.role;
  if (!message) return { error: "message is required" };
  if (message.length > MAX_MESSAGE_LEN) return { error: "message is too long" };
  if (role !== "FARMER" && role !== "MERCHANT") return { error: "role must be FARMER or MERCHANT" };
  return { message, role };
}

// Map a thrown error from the model provider layer to a user-facing reply.
// Server-side detail is logged; the user only ever sees a friendly sentence.
function replyForError(err: unknown): Answered {
  if (err instanceof RateLimitError) {
    return { reply: BUSY_REPLY, source: "error", model: null, tokensUsed: null };
  }
  // eslint-disable-next-line no-console
  console.error("[assistant]", err instanceof Error ? err.message : String(err));
  if (err instanceof MissingKeyError || err instanceof LlmError) {
    return { reply: ERROR_REPLY, source: "error", model: null, tokensUsed: null };
  }
  return { reply: ERROR_REPLY, source: "error", model: null, tokensUsed: null };
}

// Handle a real (non-small-talk, non-blocked) question.
async function answerQuestion(message: string, role: Role): Promise<Answered> {
  const intent = detectIntent(message);
  const section = findSection(message);
  const knowledgeFirst = section !== null && HOW_TO_PATTERN.test(message);

  // Data path: a recognised crop -> look up exact facts, then let Groq phrase.
  // Skipped when the question is a how-to that a knowledge section already
  // answers, so naming a crop does not drag it onto the listings lookup.
  if (intent.kind === "data" && intent.crop && !knowledgeFirst) {
    let facts = "";
    try {
      const result = await lookupFacts(admin, intent.crop, intent.market, intent.timeframe);
      facts = result.facts;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[assistant] listings lookup failed:", err instanceof Error ? err.message : String(err));
      // Fall through to a general answer rather than failing the whole request.
    }

    if (facts) {
      const answer = await askModel({
        messages: [
          { role: "system", content: dataSystemPrompt(role, facts) },
          { role: "user", content: message },
        ],
      });
      return {
        reply: answer.text,
        source: "data",
        model: answer.model,
        tokensUsed: answer.usage?.totalTokens ?? null,
      };
    }

    // Crop understood but no matching listing: say so without inventing a price.
    const answer = await askModel({
      messages: [
        {
          role: "system",
          content: noDataSystemPrompt(role, intent.crop.label, intent.market?.label ?? null),
        },
        { role: "user", content: message },
      ],
    });
    return {
      reply: answer.text,
      source: "data",
      model: answer.model,
      tokensUsed: answer.usage?.totalTokens ?? null,
    };
  }

  // Knowledge path: a question about how Urimalu works, answered from
  // knowledge.ts instead of the model's own guesses. Skipped when the user
  // asked about prices without naming a crop and the only match was the
  // generic prices section, so the existing "which crop?" nudge still runs.
  if (section && !(intent.priceIntentWithoutCrop && section.id === "prices-and-listings")) {
    const answer = await askModel({
      messages: [
        { role: "system", content: knowledgeSystemPrompt(role, section.content) },
        { role: "user", content: message },
      ],
    });
    return {
      reply: answer.text,
      source: "knowledge",
      model: answer.model,
      tokensUsed: answer.usage?.totalTokens ?? null,
    };
  }

  // General path: Groq answers from its own knowledge, behind the guardrails.
  const answer = await askModel({
    messages: [
      { role: "system", content: generalSystemPrompt(role, intent.priceIntentWithoutCrop) },
      { role: "user", content: message },
    ],
  });
  return {
    reply: answer.text,
    source: "general",
    model: answer.model,
    tokensUsed: answer.usage?.totalTokens ?? null,
  };
}

Deno.serve(async (req) => {
  // CORS preflight for the browser client.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  const parsed = parseBody(payload);
  if ("error" in parsed) {
    return jsonResponse({ error: parsed.error }, 400);
  }
  const { message, role } = parsed;

  // Every path below produces one Answered, so the request is logged exactly
  // once no matter which one served it.
  //   1) Small talk -> instant canned reply, no Groq.
  //   2) Rule-based guardrails -> canned refusal, no Groq.
  //   3) Real question -> data, knowledge or general path (may call Groq).
  const userId = userIdFromRequest(req);
  let answered: Answered;
  try {
    const smallTalk = detectSmallTalk(message);
    if (smallTalk) {
      answered = { reply: smallTalkReply(smallTalk, role), source: "smalltalk" };
    } else {
      const guard = runGuardrails(message);
      if (guard.blocked) {
        answered = { reply: guard.reply ?? ERROR_REPLY, source: "blocked" };
      } else {
        answered = await answerQuestion(message, role);
      }
    }
  } catch (err) {
    answered = replyForError(err);
  }

  await logInteraction(admin, {
    userId,
    role,
    message,
    reply: answered.reply,
    source: answered.source,
    model: answered.model ?? null,
    tokensUsed: answered.tokensUsed ?? null,
    ok: answered.source !== "error",
  });

  return jsonResponse({ reply: answered.reply, source: answered.source });
});
