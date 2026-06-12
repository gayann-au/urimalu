import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";

// Fetch all listings (active and inactive) for the given merchant,
// ordered by crop_name. The merchant needs to see inactive crops too
// so they can toggle them back on.
export function useMyListings(merchantId) {
  return useQuery({
    queryKey: qk.listingsByMerchant(merchantId),
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("crop_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

// Insert or update a single listing row, then append to price_history.
// If the listing object has an id, it is an update. Otherwise, insert.
// When call_for_price is true, price is forced to null before saving.
// On insert, confirmed_at is set to now (a fresh crop is confirmed for today
// by default). On update, confirmed_at is NOT touched — editing a price is
// not the same as confirming today's prices.
export function useSaveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (listing) => {
      const { id, ...fields } = listing;

      // Enforce: no price when call_for_price is set.
      if (fields.call_for_price) {
        fields.price = null;
      }

      let saved;

      if (id) {
        // Update existing row. Do not touch confirmed_at here.
        const { data, error } = await supabase
          .from("listings")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        saved = data;
      } else {
        // Insert new row. A freshly added crop counts as confirmed for today.
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("listings")
          .insert({ ...fields, confirmed_at: now })
          .select()
          .single();
        if (error) throw error;
        saved = data;
      }

      // Append one snapshot to price_history.
      // price_per_kg is read from the saved row (the DB computed it).
      const { error: histErr } = await supabase.from("price_history").insert({
        listing_id:   saved.id,
        merchant_id:  saved.merchant_id,
        crop_name:    saved.crop_name,
        price:        saved.price,
        price_per_kg: saved.price_per_kg,
      });
      if (histErr) throw histErr;

      return saved;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: qk.listingsByMerchant(saved.merchant_id) });
    },
  });
}

// Flip is_active for one listing. Does NOT write to price_history.
export function useToggleListingActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active, merchant_id }) => {
      const { data, error } = await supabase
        .from("listings")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("merchant_id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      // merchant_id comes back from the select; variables carries it as fallback.
      const merchantId = data?.merchant_id ?? variables.merchant_id;
      qc.invalidateQueries({ queryKey: qk.listingsByMerchant(merchantId) });
    },
  });
}

// Delete one listing row by id.
export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, merchant_id }) => {
      const { error } = await supabase
        .from("listings")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { merchant_id };
    },
    onSuccess: ({ merchant_id }) => {
      qc.invalidateQueries({ queryKey: qk.listingsByMerchant(merchant_id) });
    },
  });
}

// Confirm all of the merchant's active listings as today's prices.
// Bulk-updates confirmed_at and updated_at, then writes one price_history row
// per active listing so the chart records that the price was confirmed today.
//
// Call with the merchant id: confirmPrices.mutateAsync(merchantId).
export function useConfirmTodaysPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (merchantId) => {
      // 1. Fetch the merchant's active listings.
      const { data: activeListings, error: fetchErr } = await supabase
        .from("listings")
        .select("*")
        .eq("merchant_id", merchantId)
        .eq("is_active", true);
      if (fetchErr) throw fetchErr;

      if (!activeListings || activeListings.length === 0) {
        return { merchant_id: merchantId, count: 0 };
      }

      const now = new Date().toISOString();

      // 2. Bulk update confirmed_at + updated_at on those rows.
      const { error: updErr } = await supabase
        .from("listings")
        .update({ confirmed_at: now, updated_at: now })
        .eq("merchant_id", merchantId)
        .eq("is_active", true);
      if (updErr) throw updErr;

      // 3. Append one price_history row per active listing.
      const historyRows = activeListings.map((l) => ({
        listing_id:   l.id,
        merchant_id:  l.merchant_id,
        crop_name:    l.crop_name,
        price:        l.price,
        price_per_kg: l.price_per_kg,
      }));
      const { error: histErr } = await supabase
        .from("price_history")
        .insert(historyRows);
      if (histErr) throw histErr;

      return { merchant_id: merchantId, count: activeListings.length };
    },
    onSuccess: ({ merchant_id }) => {
      qc.invalidateQueries({ queryKey: qk.listingsByMerchant(merchant_id) });
    },
  });
}

// Full price history for the merchant, ordered most-recent-first.
// Uses a distinct cache key from the profile page's 7-day query so the
// two reads do not overwrite each other.
export function useMyPriceHistory(merchantId) {
  return useQuery({
    queryKey: ["price_history", "merchant", "all", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_history")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

// Group price_history rows by calendar date (local time).
// Returns an array of { date_key, date_label, crops } sorted newest first.
// Within each day, each crop_name appears once — the row with the most
// recent recorded_at wins. Crops are sorted by crop_name ascending.
export function groupHistoryByDate(rows) {
  // date_key -> Map<crop_name, latest row for that crop on that date>
  const byDateAndCrop = new Map();
  for (const r of rows || []) {
    if (!r.recorded_at) continue;
    const dKey = localDateKey(r.recorded_at);
    if (!byDateAndCrop.has(dKey)) byDateAndCrop.set(dKey, new Map());
    const cropMap = byDateAndCrop.get(dKey);
    const existing = cropMap.get(r.crop_name);
    if (!existing || Date.parse(r.recorded_at) > Date.parse(existing.recorded_at)) {
      cropMap.set(r.crop_name, r);
    }
  }

  const groups = [];
  for (const [dKey, cropMap] of byDateAndCrop) {
    const crops = [...cropMap.values()].sort(
      (a, b) => (a.crop_name || "").localeCompare(b.crop_name || "")
    );
    const sample = crops[0]?.recorded_at;
    groups.push({
      date_key:   dKey,
      date_label: sample ? dateLabel(sample) : dKey,
      crops,
    });
  }

  // Newest date first.
  groups.sort((a, b) => b.date_key.localeCompare(a.date_key));
  return groups;
}

// Local "YYYY-MM-DD" key derived from an ISO timestamp.
function localDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Readable date label like "5 Jun 2026".
function dateLabel(ts) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}
