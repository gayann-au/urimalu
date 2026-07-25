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
export type ReplySource = "smalltalk" | "blocked" | "data" | "general" | "error";

// The response envelope the browser receives.
export interface AssistantReply {
  reply: string;
  source: ReplySource;
}
