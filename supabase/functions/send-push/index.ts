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

  // Send to every subscription. A gone subscription (404/410) is pruned so the
  // table does not accumulate dead endpoints.
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          message
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    })
  );

  return new Response(JSON.stringify({ sent: subs?.length ?? 0 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
