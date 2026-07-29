// Model provider chat-completions client.
//
// This is the ONLY place that spends the shared free-tier quota. It is reached
// only after small-talk and guardrail checks have passed, and (on the data
// path) after the database facts have been fetched.
//
// The provider is selected by environment variables alone, so swapping it does
// not touch any other file. There is one adapter today, the OpenAI-compatible
// chat-completions shape, which Groq already speaks.
//
// Rate limiting for a SINGLE shared key used by every farmer and merchant at
// once has two layers here:
//   1. A best-effort in-isolate sliding-window limiter. NOTE: Edge Function
//      isolates are ephemeral and not shared across instances, so this only
//      smooths bursts within one warm isolate. A durable global limit (across
//      all instances) would need Deno KV or a small counter table; that is
//      intentionally deferred until the exact provider RPM/TPM is confirmed
//      against the provider's official limits page, and because a counter table
//      is a schema change that needs sign-off.
//   2. Honouring the provider's own 429 response, surfaced as RateLimitError so
//      the caller can show a friendly "busy, try again" message.

// Which provider adapter to use. Recorded here so the choice is explicit and
// loggable; there is only one adapter for now.
const PROVIDER = Deno.env.get("LLM_PROVIDER") ?? "groq";

// Root of the provider API, WITHOUT the /chat/completions path. Each adapter
// appends its own path.
const BASE_URL = Deno.env.get("LLM_BASE_URL") ?? "https://api.groq.com/openai/v1";

// Free-tier friendly default model. Overridable without a code change.
const MODEL = Deno.env.get("LLM_MODEL") ?? Deno.env.get("GROQ_MODEL") ?? "llama-3.1-8b-instant";

// Conservative in-isolate ceiling. Kept well under typical free-tier RPM as a
// burst smoother, not the real limit. Override with LLM_MAX_RPM.
const MAX_RPM = Number(Deno.env.get("LLM_MAX_RPM") ?? Deno.env.get("GROQ_MAX_RPM") ?? "25");
const WINDOW_MS = 60_000;

// Request defaults. Callers may override per call; leaving both unset produces
// exactly the request body this function has always sent.
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 400;

// Distinct error types so index.ts can map each to the right user message.
export class MissingKeyError extends Error {}
export class RateLimitError extends Error {}
export class LlmError extends Error {}

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AskModelInput {
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface AskModelResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  finishReason: string | null;
  model: string;
}

// Everything an adapter needs to build one request. Resolved from config plus
// the caller's input before the adapter is handed control.
interface AdapterContext {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  temperature: number;
  maxTokens: number;
}

// A provider adapter owns the wire format: the URL it posts to, the request it
// builds, and how it reads the response. Adding a second provider means adding
// another object of this shape and registering it below. No caller changes.
interface ProviderAdapter {
  buildRequest(ctx: AdapterContext): { url: string; init: RequestInit };
  // The adapter reads the wire response, which does not carry the configured
  // model name, so it returns everything except model and askModel adds that.
  parseResponse(json: unknown): Omit<AskModelResult, "model">;
}

// Loose shape of an OpenAI-compatible chat-completions response. Every field is
// optional because the provider is not trusted to send them.
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: unknown };
    finish_reason?: unknown;
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function toTokenCount(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

// Read usage if the provider reported it. Null when absent; nothing depends on
// it yet, it exists so quota tracking can be added without a signature change.
function readUsage(usage: ChatCompletionResponse["usage"]): AskModelResult["usage"] {
  if (!usage || typeof usage !== "object") return null;
  return {
    promptTokens: toTokenCount(usage.prompt_tokens),
    completionTokens: toTokenCount(usage.completion_tokens),
    totalTokens: toTokenCount(usage.total_tokens),
  };
}

// The OpenAI-compatible chat-completions adapter. Groq, and most other hosted
// providers, accept this exact shape.
const openAiCompatibleAdapter: ProviderAdapter = {
  buildRequest(ctx) {
    return {
      url: `${stripTrailingSlash(ctx.baseUrl)}/chat/completions`,
      init: {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ctx.model,
          temperature: ctx.temperature,
          // NOTE for whoever adds the next adapter: some providers have moved to
          // max_completion_tokens and reject max_tokens. Do NOT change it here,
          // Groq accepts max_tokens and this request must stay as it is.
          max_tokens: ctx.maxTokens,
          messages: ctx.messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      },
    };
  },

  parseResponse(json) {
    const body = (json ?? null) as ChatCompletionResponse | null;
    const choice = body?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new LlmError("model provider returned an empty completion");
    }
    return {
      text: content.trim(),
      usage: readUsage(body?.usage),
      finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
    };
  },
};

// Registry of adapters by provider name. Unknown names fall back to the
// OpenAI-compatible shape, which is what most providers speak.
const ADAPTERS: Record<string, ProviderAdapter> = {
  groq: openAiCompatibleAdapter,
};

function selectAdapter(): ProviderAdapter {
  return ADAPTERS[PROVIDER] ?? openAiCompatibleAdapter;
}

// Sliding window of recent call timestamps (this isolate only).
const recentCalls: number[] = [];

function underLocalLimit(): boolean {
  const now = Date.now();
  // Drop timestamps older than the window.
  while (recentCalls.length && now - recentCalls[0] > WINDOW_MS) {
    recentCalls.shift();
  }
  return recentCalls.length < MAX_RPM;
}

// Send a conversation to the configured model provider. Returns the assistant
// text plus usage and finish reason when the provider reports them.
// Throws MissingKeyError / RateLimitError / LlmError on the respective faults.
export async function askModel(input: AskModelInput): Promise<AskModelResult> {
  const key = Deno.env.get("LLM_API_KEY") ?? Deno.env.get("GROQ_API_KEY") ?? "";
  if (!key) throw new MissingKeyError("model provider API key is not set");

  if (!underLocalLimit()) {
    throw new RateLimitError("local rate limit reached");
  }
  recentCalls.push(Date.now());

  const adapter = selectAdapter();
  const { url, init } = adapter.buildRequest({
    baseUrl: BASE_URL,
    apiKey: key,
    model: MODEL,
    messages: input.messages,
    temperature: input.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
  });

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new LlmError(`network error calling model provider: ${(err as Error).message}`);
  }

  if (res.status === 429) {
    throw new RateLimitError("model provider returned 429");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LlmError(`model provider error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = await res.json().catch(() => null);
  const result = adapter.parseResponse(json);
  return { ...result, model: MODEL };
}
