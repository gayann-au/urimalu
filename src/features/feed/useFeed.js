import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";

async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("*");
  if (error) throw error;
  return data || [];
}

async function fetchReviews() {
  const { data, error } = await supabase.from("reviews").select("*");
  if (error) throw error;
  return data || [];
}

// Fetch the public feed: active listings from approved, non-disabled merchants.
//
// We fetch listings and users separately and join in JS, matching the existing
// pattern in this codebase. The merchant filter checks the DB status directly:
// RLS blocks unapproved merchants from creating listings, so any listing that
// exists already belongs to a truly approved merchant. No client-side
// auto-approve logic is needed here.
async function fetchFeedListings() {
  const [listingsRes, usersRes] = await Promise.all([
    supabase.from("listings").select("*").eq("is_active", true),
    supabase.from("users").select("*"),
  ]);
  if (listingsRes.error) throw listingsRes.error;
  if (usersRes.error)    throw usersRes.error;

  const merchantsById = new Map();
  for (const u of usersRes.data || []) {
    if (u.role !== "MERCHANT") continue;
    if (u.status !== "APPROVED") continue;
    if (u.is_disabled) continue;
    merchantsById.set(u.id, u);
  }

  const result = [];
  for (const l of listingsRes.data || []) {
    const m = merchantsById.get(l.merchant_id);
    if (!m) continue;
    result.push({
      ...l,
      merchant: {
        id:            m.id,
        business_name: m.business_name,
        town:          m.town,
        district:      m.district,
        phone:         m.phone,
        whatsapp:      m.whatsapp,
      },
    });
  }
  return result;
}

export function useUsers()    { return useQuery({ queryKey: qk.users,    queryFn: fetchUsers }); }
export function useReviews()  { return useQuery({ queryKey: qk.reviews,  queryFn: fetchReviews }); }
export function useListings() { return useQuery({ queryKey: qk.listings, queryFn: fetchFeedListings }); }

// Helper for the feed page: the unique, sorted list of crop names that appear
// in the current feed. Useful for building crop filter chips. Filtering and
// sorting of the items themselves stays in the feed page.
export function uniqueCropsInFeed(items) {
  const set = new Set();
  for (const i of items || []) set.add(i.crop_name);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Group feed items by merchant. Input is the array returned by useListings,
// which is already filtered to active listings from approved merchants — do
// not refilter here.
//
// Returns an array of merchant groups, each:
//   { merchant, crop_count, last_confirmed_at, listings }
//
// Groups are sorted by last_confirmed_at descending (most recent first),
// nulls last. Within each group, listings are sorted by crop_name ascending.
export function groupFeedByMerchant(items) {
  const byId = new Map();
  for (const item of items || []) {
    const m = item.merchant;
    if (!m || !m.id) continue;
    if (!byId.has(m.id)) byId.set(m.id, { merchant: m, listings: [] });
    byId.get(m.id).listings.push(item);
  }

  const groups = [];
  for (const g of byId.values()) {
    g.listings.sort((a, b) => (a.crop_name || "").localeCompare(b.crop_name || ""));
    let mostRecent = null;
    for (const l of g.listings) {
      if (!l.confirmed_at) continue;
      const t = Date.parse(l.confirmed_at);
      if (isNaN(t)) continue;
      if (mostRecent == null || t > Date.parse(mostRecent)) {
        mostRecent = l.confirmed_at;
      }
    }
    groups.push({
      merchant:          g.merchant,
      crop_count:        g.listings.length,
      last_confirmed_at: mostRecent,
      listings:          g.listings,
    });
  }

  groups.sort((a, b) => {
    const at = a.last_confirmed_at ? Date.parse(a.last_confirmed_at) : null;
    const bt = b.last_confirmed_at ? Date.parse(b.last_confirmed_at) : null;
    if (at == null && bt == null) return 0;
    if (at == null) return 1;  // nulls last
    if (bt == null) return -1;
    return bt - at;            // most recent first
  });

  return groups;
}
