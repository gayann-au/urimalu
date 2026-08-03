import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

// Query key factory
export const qk = {
  session:        ["auth", "session"],
  profile: (id) => ["users", id],
  users:          ["users", "all"],
  rates:          ["rates", "all"],
  ratesByMerchant: (id) => ["rates", "merchant", id],
  listings:       ["listings", "all"],
  listingsByMerchant: (id) => ["listings", "merchant", id],
  reviews:        ["reviews", "all"],
  reviewsByMerchant: (id) => ["reviews", "merchant", id],
  leads:          ["leads", "all"],
  leadsByMerchant: (id) => ["leads", "merchant", id],
  featureRequests:      ["feature_requests", "all"],
  featureRequestsMine: (id) => ["feature_requests", "mine", id],
  cropFollows: (id) => ["crop_follows", "mine", id],
  notifications: (id) => ["notifications", "mine", id],
  sellerLeadsMine: (farmerId) => ["seller_leads", "mine", farmerId],
  sellerLeadsActive: ["seller_leads", "active"],
  sellerLeadReads: (merchantId) => ["seller_lead_reads", "mine", merchantId],
  marketSnapshots: ["market_snapshots", "all"],
  weather: (lat, lon) => ["weather", lat, lon],
  // One key for the whole five town batch, because it is one request. Keying
  // per town would make React Query cache five slices of a payload that only
  // ever arrives whole.
  kodaguWeather: ["weather", "kodagu", "towns"],
  usdInr: ["fx", "usd_inr"],
};