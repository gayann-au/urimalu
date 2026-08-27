// Supabase Edge Function: send-push
//
// Triggered by a Database Webhook on INSERT into public.notifications. For the
// notification's user, it looks up every stored push subscription and sends a
// web push. The text is composed here from the notification's structured
// fields (crop, old price, new price, merchant), so the row itself stores no
// pre-rendered sentence.
//
// Language: the app does not store a per-user language server side, so push
// text is ENGLISH ONLY. In-app notifications remain fully bilingual because
// those are rendered in the browser in the reader's chosen language; only the
// push copy is fixed to English.
//
// Secrets required (set via the Supabase dashboard or CLI, never committed):
//   VAPID_PUBLIC_KEY    the public VAPID key (same value as the frontend)
//   VAPID_PRIVATE_KEY   the private VAPID key (server only)
//   VAPID_SUBJECT       a mailto: or https: contact URL for the push service
//   PUSH_WEBHOOK_SECRET optional; if set, the webhook must send a matching
//                       x-webhook-secret header, otherwise the call is rejected
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const rupees = (v: number | null) =>
  v == null ? null : "₹" + Math.round(Number(v));

// English push copy, matching the in-app sentence shapes. Title is the crop,
// body carries the price movement. A seller_lead row has no crop_name; it
// carries farmer_name instead, and gets its own fixed copy.
function buildText(record: Record<string, unknown>) {
  if (record.type === "seller_lead") {
    const farmer = String(record.farmer_name ?? "A farmer");
    return {
      title: "Ready to sell",
      body: `${farmer} is ready to sell. Tap to see details.`,
      url: "/merchant/dashboard",
    };
  }

  const crop = String(record.crop_name ?? "Crop");
  const merchant = String(record.merchant_name ?? "a merchant");
  const oldP = record.old_price as number | null;
  const newP = record.new_price as number | null;

  let body: string;
  if (newP == null) {
    body = `Price updated at ${merchant}`;
  } else if (oldP == null) {
    body = `${rupees(newP)} per kg at ${merchant}`;
  } else {
    body = `${rupees(newP)} per kg at ${merchant} (was ${rupees(oldP)})`;
  }
  return { title: crop, body, url: "/notifications" };
}

Deno.serve(async (req) => {
  // Optional shared-secret gate.
  if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 401 });
  }

  let record: Record<string, unknown> | null = null;
  try {
    const payload = await req.json();
    record = payload.record ?? payload; // Supabase webhook wraps the row in .record
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const userId = record?.user_id;
  if (!userId) return new Response("no user_id", { status: 200 });

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, keys")
    .eq("user_id", userId);
  if (error) return new Response("db error: " + error.message, { status: 500 });

  const message = JSON.stringify(buildText(record!));

  // WHY THIS FUNCTION TALKS TO THE LOG AT ALL.
  //
  // The catch below used to read the status code, prune on 404 and 410, and
  // throw everything else away. That made the logs clean in the worst possible
  // way: a push service rejecting a message for any other reason left no trace
  // anywhere, so "the logs are quiet" and "delivery is broken" looked
  // identical. Every send now says what happened, once, on one line.
  //
  // WHAT IS NEVER LOGGED: the full endpoint (it is a capability, anyone
  // holding it can push to that device), the subscription keys, and the VAPID
  // keys. The hostname is logged instead, which says which push service
  // rejected us and carries no secret.
  console.log(
    `[send-push] type=${String(record?.type ?? "unknown")} subscriptions=${subs?.length ?? 0}`
  );

  const hostOf = (endpoint: string) => {
    try {
      return new URL(endpoint).hostname;
    } catch {
      return "unparseable-endpoint";
    }
  };

  let succeeded = 0;
  let failed = 0;

  // Send to every subscription. A gone subscription (404/410) is pruned so the
  // table does not accumulate dead endpoints.
  await Promise.all(
    (subs ?? []).map(async (s) => {
      const host = hostOf(s.endpoint);
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          message
        );
        succeeded++;
        console.log(`[send-push] ok host=${host}`);
      } catch (err) {
        failed++;
        const e = err as { statusCode?: number; body?: unknown; message?: string };
        const status = e.statusCode;
        const raw = e.body ?? e.message ?? "no detail provided by the push library";
        // The library puts the endpoint on the error object and can repeat it
        // inside the message, so the detail is scrubbed before it is printed
        // rather than trusted to be clean.
        const detail = (typeof raw === "string" ? raw : JSON.stringify(raw))
          .split(s.endpoint)
          .join("[endpoint removed]");
        console.error(
          `[send-push] FAILED host=${host} status=${status ?? "none"} detail=${detail}`
        );
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          console.log(`[send-push] pruned gone subscription host=${host} status=${status}`);
        }
      }
    })
  );

  console.log(`[send-push] done succeeded=${succeeded} failed=${failed}`);

  return new Response(
    JSON.stringify({ sent: subs?.length ?? 0, succeeded, failed }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
});
