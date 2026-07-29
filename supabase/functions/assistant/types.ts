// Shared types for the assistant function. Kept in one small module so every
// other file imports the same definitions instead of redeclaring them.

// The two roles the assistant serves. ADMIN and logged-out visitors never
// reach this function (the widget is only mounted for farmers and merchants),
// so the request contract is limited to these two.
export type Role = "FARMER" | "MERCHANT";

// The validated request body. index.ts rejects anything that does not match.
export interface AssistantRequest {
  message: string;
  role: Role;
}

// How an answer was produced. Returned to the client for debugging and so the
// UI can, if it ever wants to, treat data-backed answers differently from
// general ones. "blocked" and "smalltalk" never touch Groq.
//
// The three data-path values are kept apart because only one of them is a
// grounded answer, and collapsing them hides that:
//   "data"        the listings lookup ran, matched rows, and the model phrased
//                 an answer from those exact rows. This is the grounded one.
//   "nolistings"  the lookup ran and matched nothing. The crop was understood,
//                 there is simply no current listing for it.
//   "lookupfail"  the lookup itself errored, so whether any listing exists is
//                 unknown. Answered with a canned reply, never the model.
export type ReplySource =
  | "smalltalk"
  | "blocked"
  | "data"
  | "nolistings"
  | "lookupfail"
  | "knowledge"
  | "general"
  | "error";

// The response envelope the browser receives.
export interface AssistantReply {
  reply: string;
  source: ReplySource;
}
