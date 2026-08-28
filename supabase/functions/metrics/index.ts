// Supabase Edge Function: metrics
//
// The admin metrics readout, computed server side and returned as aggregates.
// Called from the browser via supabase.functions.invoke("metrics").
//
// WHY THIS EXISTS AT ALL, RATHER THAN QUERIES IN THE PAGE.
//
// Most of what this app records is deliberately unreadable from a browser, and
// that is not an accident to be worked around. push_subscriptions,
// notifications, crop_follows and seller_leads are all own-rows-only under RLS,
// so an admin querying them from the client gets zero rows and no error, which
// is the worst possible answer: a dashboard reporting "0 devices registered"
// while push is working fine. assistant_logs is sealed harder still, with RLS
// enabled, no policies at all, and REVOKE ALL from both browser roles. And
// users.last_seen_at and users.installed_at sit outside the column GRANT that
// 20260612000001_users_select_lockdown.sql set up, so the browser cannot read
// them whatever its role.
//
// The service role holds BYPASSRLS and keeps its table privileges, so this
// function can read all of it. Nothing here widens a policy, adds a grant, or
// changes a schema. The seal stays exactly where it is; this function sits
// behind it and is gated on the caller being an admin.
//
// WHAT IS RETURNED, AND WHAT IS NOT. Aggregates only. No user ids, no personal
// names, no phone numbers, no notification bodies, no assistant replies, no
// push endpoints. Merchant rows carry a business name because naming the quiet
// merchant is the entire point of that section, and business names are already
// public in the feed. assistant_logs contributes counts and repeated question
// text and nothing else: its user_id is never selected, so this readout cannot
// say who asked anything even by accident.
//
// COUNTING HAPPENS IN POSTGRES. Every scalar below is a head request with an
// exact count, so Postgres counts and returns a number with no rows attached.
// The two grouped sections are reduced here in the function, over rows that
// never leave the server, because a real GROUP BY would need a view or an RPC
// and this work is not allowed a schema change.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// Service-role client, same pattern as send-push and assistant.
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Every value notifications_type_chk allows. Listed explicitly rather than
// discovered, so a type added to the database shows up here as a missing line
// to add rather than as a number that quietly is not counted anywhere.
const NOTIFICATION_TYPES = [
  "price_alert",
  "seller_lead",
  "seller_lead_response",
  "merchant_approved",
  "merchant_rejected",
  "price_reminder",
] as const;

// Every value assistant_logs_source_chk allows, including the two the function
// reserves for paths not yet written.
const ASSISTANT_SOURCES = [
  "smalltalk",
  "blocked",
  "data",
  "general",
  "knowledge",
  "outside",
  "error",
] as const;

// How far back the assistant question tally looks, and the ceiling on how many
// question texts it will pull to build it. Both are constants so the cost of
// that section is bounded and visible rather than growing with the table.
const ASSISTANT_WINDOW_DAYS = 30;
const ASSISTANT_ROW_CAP = 2000;
const ASSISTANT_TOP_N = 10;

// Ceiling on the listings pulled for the merchant aggregation. Well clear of
// the current table and low enough that a runaway cannot stall the function.
const LISTINGS_CAP = 20000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// One exact count, computed by Postgres, with no rows transferred.
//
// Returns null rather than throwing when the count fails, so one broken section
// reports itself as unavailable instead of collapsing the whole page. A null on
// screen reads as "could not be counted", which is honest. A zero would be a
// lie of exactly the kind this function exists to prevent.
async function countRows(
  table: string,
  apply: (q: any) => any = (q) => q,
): Promise<number | null> {
  try {
    const { count, error } = await apply(
      admin.from(table).select("*", { count: "exact", head: true }),
    );
    if (error) {
      console.error(`[metrics] count failed on ${table}:`, error.message || error);
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.error(`[metrics] count threw on ${table}:`, err);
    return null;
  }
}

// Count one bucket per key, in parallel. Used where the grouping is over a
// known, short, fixed list of values, so a handful of exact counts beats
// pulling rows in order to group them.
async function countByValue(
  table: string,
  column: string,
  values: readonly string[],
  apply: (q: any) => any = (q) => q,
): Promise<Record<string, number | null>> {
  const entries = await Promise.all(
    values.map(async (value) =>
      [value, await countRows(table, (q) => apply(q).eq(column, value))] as const,
    ),
  );
  return Object.fromEntries(entries);
}

// WHO IS ALLOWED IN.
//
// Two separate checks, and both are needed. getUser verifies the token against
// the auth server, so a forged or expired JWT is rejected rather than decoded
// and believed. Then the role is read through the service role, which bypasses
// RLS, so the answer comes from the users table itself and never from a claim
// the caller supplied.
//
// The platform's own verify_jwt is not enough on its own and is not being
// relied on here: a logged-out browser sends the anon key, which is a perfectly
// valid project JWT and passes that gate. getUser is what rejects it, because
// there is no user behind it.
async function requireAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse({ error: "unauthorized" }, 401);

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return jsonResponse({ error: "unauthorized" }, 401);

  const { data: row, error: roleError } = await admin
    .from("users")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  // A failed role lookup is not permission to proceed. It refuses.
  if (roleError) {
    console.error("[metrics] role lookup failed:", roleError.message || roleError);
    return jsonResponse({ error: "unavailable" }, 503);
  }
  if (!row || row.role !== "ADMIN") return jsonResponse({ error: "forbidden" }, 403);

  return null;
}

// Users: the headline counts.
async function usersSection() {
  const weekAgo = daysAgoIso(7);
  const [total, farmers, merchants, admins, joinedThisWeek, approved, pending] =
    await Promise.all([
      countRows("users"),
      countRows("users", (q) => q.eq("role", "FARMER")),
      countRows("users", (q) => q.eq("role", "MERCHANT")),
      countRows("users", (q) => q.eq("role", "ADMIN")),
      countRows("users", (q) => q.gte("created_at", weekAgo)),
      countRows("users", (q) => q.eq("role", "MERCHANT").eq("status", "APPROVED")),
      countRows("users", (q) => q.eq("role", "MERCHANT").eq("status", "PENDING")),
    ]);
  return { total, farmers, merchants, admins, joinedThisWeek, approved, pending };
}

// Reach: registered devices, and what actually went out this week.
async function reachSection() {
  const weekAgo = daysAgoIso(7);
  const [devices, sentLast7Days, byType] = await Promise.all([
    countRows("push_subscriptions"),
    countRows("notifications", (q) => q.gte("created_at", weekAgo)),
    countByValue("notifications", "type", NOTIFICATION_TYPES, (q) =>
      q.gte("created_at", weekAgo),
    ),
  ]);
  return { devices, sentLast7Days, byType };
}

// Merchant activity: the section this page exists for.
//
// One row per merchant, carrying when they last confirmed prices and how many
// live listings they have. Reduced here rather than in Postgres because a GROUP
// BY would need a view or an RPC, which is a schema change. The listings rows
// are read and folded inside this function and never leave it; what the phone
// receives is one small object per merchant.
async function merchantsSection() {
  const { data: merchants, error: merchantsError } = await admin
    .from("users")
    .select("id, business_name, status, is_disabled, created_at")
    .eq("role", "MERCHANT");

  if (merchantsError) {
    console.error("[metrics] merchant read failed:", merchantsError.message || merchantsError);
    return null;
  }

  const { data: listings, error: listingsError } = await admin
    .from("listings")
    .select("merchant_id, confirmed_at, is_active")
    .limit(LISTINGS_CAP);

  if (listingsError) {
    console.error("[metrics] listings read failed:", listingsError.message || listingsError);
    return null;
  }

  const byMerchant = new Map<string, { lastConfirmedAt: string | null; activeListings: number }>();
  for (const row of listings ?? []) {
    const id = row.merchant_id as string;
    if (!id) continue;
    const acc = byMerchant.get(id) ?? { lastConfirmedAt: null, activeListings: 0 };
    if (row.is_active === true) acc.activeListings += 1;
    const confirmed = row.confirmed_at as string | null;
    // Newest confirmed_at across every listing this merchant owns, active or
    // not. A merchant who deactivated everything last month still has a last
    // confirmed date, and hiding it would hide exactly the quiet merchant this
    // section exists to surface. ISO 8601 strings from the same column compare
    // correctly as text, so no date parsing is needed to find the newest.
    if (confirmed && (!acc.lastConfirmedAt || confirmed > acc.lastConfirmedAt)) {
      acc.lastConfirmedAt = confirmed;
    }
    byMerchant.set(id, acc);
  }

  const now = Date.now();
  const rows = (merchants ?? []).map((m) => {
    const acc = byMerchant.get(m.id as string) ?? { lastConfirmedAt: null, activeListings: 0 };
    const daysSinceConfirmed = acc.lastConfirmedAt
      ? Math.floor((now - Date.parse(acc.lastConfirmedAt)) / 86_400_000)
      : null;
    return {
      businessName: (m.business_name as string) || "Unnamed merchant",
      status: m.status as string,
      isDisabled: m.is_disabled === true,
      joinedAt: m.created_at as string,
      lastConfirmedAt: acc.lastConfirmedAt,
      daysSinceConfirmed,
      activeListings: acc.activeListings,
    };
  });

  // Quietest first, and never-confirmed above everyone else, because that
  // ordering is the whole use of this list: the top of it is the work to do.
  rows.sort((a, b) => {
    if (a.daysSinceConfirmed === null && b.daysSinceConfirmed === null) return 0;
    if (a.daysSinceConfirmed === null) return -1;
    if (b.daysSinceConfirmed === null) return 1;
    return b.daysSinceConfirmed - a.daysSinceConfirmed;
  });

  return rows;
}

// Farmer activity.
//
// leadsOpened counts the legacy leads table, which is the merchant contact
// lead. readyToSellPosts counts seller_leads, which is what the farmer posts
// from the feed. They are different things and are deliberately not summed.
async function farmersSection() {
  const weekAgo = daysAgoIso(7);
  const [readyToSellPosts, cropFollows, leadsOpened, seenLast7Days] = await Promise.all([
    countRows("seller_leads"),
    countRows("crop_follows"),
    countRows("leads"),
    countRows("users", (q) => q.eq("role", "FARMER").gte("last_seen_at", weekAgo)),
  ]);
  return { readyToSellPosts, cropFollows, leadsOpened, seenLast7Days };
}

// AI assistant.
//
// NOTHING HERE IDENTIFIES ANYONE. user_id is never selected, so it cannot be
// returned by accident, and neither is reply. What comes back is how many
// questions were asked, which tier answered them, and which question texts
// repeat. The migration that created this table forbids opening it to every
// signed-in user with a policy, which this does not do: the table stays sealed
// and the service role behind an admin check is the only way through.
async function assistantSection() {
  const windowStart = daysAgoIso(ASSISTANT_WINDOW_DAYS);

  const [total, totalInWindow, bySource] = await Promise.all([
    countRows("assistant_logs"),
    countRows("assistant_logs", (q) => q.gte("created_at", windowStart)),
    countByValue("assistant_logs", "source", ASSISTANT_SOURCES, (q) =>
      q.gte("created_at", windowStart),
    ),
  ]);

  // Repeated questions. Only the message column is read, windowed and capped.
  let topQuestions: { question: string; count: number }[] | null = null;
  try {
    const { data, error } = await admin
      .from("assistant_logs")
      .select("message")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(ASSISTANT_ROW_CAP);

    if (error) {
      console.error("[metrics] assistant question read failed:", error.message || error);
    } else {
      const tally = new Map<string, { question: string; count: number }>();
      for (const row of data ?? []) {
        const raw = ((row.message as string) || "").trim();
        if (!raw) continue;
        // Case and spacing are folded for the key only, so "Coffee price?" and
        // "coffee price?" count as one question. The first spelling seen is
        // what gets shown, so the readout stays in real words.
        const key = raw.toLowerCase().replace(/\s+/g, " ");
        const hit = tally.get(key);
        if (hit) hit.count += 1;
        else tally.set(key, { question: raw, count: 1 });
      }
      topQuestions = [...tally.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, ASSISTANT_TOP_N);
    }
  } catch (err) {
    console.error("[metrics] assistant question tally threw:", err);
  }

  return { total, totalInWindow, windowDays: ASSISTANT_WINDOW_DAYS, bySource, topQuestions };
}

// Installs and last seen.
//
// installedAndroidDesktop counts what the appinstalled event can actually see.
// That event does not exist on iOS, so every iPhone install is missing from it
// by definition. The field is named for what it really counts so that nobody
// downstream has to rediscover the caveat from browser documentation, and the
// page must never present it as total installs.
async function devicesSection() {
  const dayAgo = daysAgoIso(1);
  const weekAgo = daysAgoIso(7);
  const [installedAndroidDesktop, seenLast24Hours, seenLast7Days] = await Promise.all([
    countRows("users", (q) => q.not("installed_at", "is", null)),
    countRows("users", (q) => q.gte("last_seen_at", dayAgo)),
    countRows("users", (q) => q.gte("last_seen_at", weekAgo)),
  ]);
  return { installedAndroidDesktop, seenLast24Hours, seenLast7Days };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const refusal = await requireAdmin(req);
    if (refusal) return refusal;

    const [users, reach, merchants, farmers, assistant, devices] = await Promise.all([
      usersSection(),
      reachSection(),
      merchantsSection(),
      farmersSection(),
      assistantSection(),
      devicesSection(),
    ]);

    return jsonResponse({
      generatedAt: new Date().toISOString(),
      users,
      reach,
      merchants,
      farmers,
      assistant,
      devices,
    });
  } catch (err) {
    console.error("[metrics] unexpected failure:", err);
    return jsonResponse({ error: "unavailable" }, 500);
  }
});
