// Interaction logging for the assistant.
//
// Every answered request writes one row to assistant_logs, whatever path
// produced it: small talk, a blocked question, a database answer, a knowledge
// base answer, a general answer, or an error. The row is what makes it possible
// to see later what people actually ask and which path served them.
//
// The one rule this file must never break: logging is best effort. A failed
// insert is swallowed and reported to the function log, never raised, because a
// logging problem must not cost the user their answer.

// Just enough of the Supabase client to insert a row. Kept structural on
// purpose so this file needs no import from the client library.
interface InsertClient {
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
}

// One assistant interaction, in the shape the caller already has it. Mapped to
// the snake_case column names at the point of insert.
interface LogEntry {
  userId: string | null;
  role: string;
  message: string;
  reply: string | null;
  source: string;
  model: string | null;
  tokensUsed: number | null;
  // What the router decided the user was asking for, and which knowledge
  // section served the answer. Null on the paths that never route: small talk,
  // a blocked question, an error before routing. These two are what make the
  // next routing problem measurable instead of guessed.
  askType: string | null;
  sectionId: string | null;
  ok: boolean;
}

// The claims this file cares about. Both are unknown because nothing in the
// token is trusted until it has been checked.
interface TokenClaims {
  sub?: unknown;
  role?: unknown;
}

// Pull the calling user's id out of the Supabase JWT on the request.
//
// Returns null whenever there is no real logged-in user behind the call. That
// includes the case worth spelling out: a logged-out browser still sends the
// anon key, which is a perfectly valid token, but its role is "anon" rather
// than "authenticated" and there is no user behind it. Only a token whose role
// is exactly "authenticated" yields an id.
//
// The signature is NOT verified here. That is deliberate: the id is used for a
// log row only, never to grant access to anything.
export function userIdFromRequest(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;

  const parts = header.slice("Bearer ".length).split(".");
  if (parts.length !== 3) return null;

  try {
    // The payload is base64url, so restore the two swapped characters and pad
    // the length back up to a multiple of 4 before atob will accept it.
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4 !== 0) payload += "=";

    const claims = JSON.parse(atob(payload)) as TokenClaims;
    if (claims.role !== "authenticated") return null;

    return typeof claims.sub === "string" && claims.sub ? claims.sub : null;
  } catch {
    // Malformed token, bad base64, bad JSON. All the same answer: no user.
    return null;
  }
}

// Write one interaction to assistant_logs. Never throws.
//
// ask_type and section_id are added by a separate hand-applied migration, so
// there is a window where the deployed code knows about them and the live table
// does not. In that window the first insert fails on an unknown column, and
// losing every log row over two new fields would be a bad trade. So the insert
// is retried once without them. The retry is safe because the first attempt
// wrote nothing, and it costs nothing once the columns exist. Remove the
// fallback after the migration is applied.
export async function logInteraction(admin: InsertClient, entry: LogEntry): Promise<void> {
  const row = {
    user_id: entry.userId,
    role: entry.role,
    message: entry.message,
    reply: entry.reply,
    source: entry.source,
    model: entry.model,
    tokens_used: entry.tokensUsed,
    ok: entry.ok,
  };

  try {
    let { error } = await admin.from("assistant_logs").insert({
      ...row,
      ask_type: entry.askType,
      section_id: entry.sectionId,
    });
    if (error) {
      ({ error } = await admin.from("assistant_logs").insert(row));
    }
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[assistant] log insert failed:", (error as { message?: string }).message ?? String(error));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[assistant] log insert failed:", err instanceof Error ? err.message : String(err));
  }
}
