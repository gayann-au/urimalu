import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadError } from "../../components/ui/LoadError";
import { marketCropKeyForAppCrop } from "../../lib/marketCrops";
import { useMyCropFollows } from "../alerts/useCropFollows";
import { useListings } from "../feed/useFeed";
import { useMarketSnapshots, cpaRowForCrop } from "./useMarketSnapshots";
import { MarketPriceCard, canRenderPrice } from "./MarketPriceCard";
import { CropSwitcher, CROP_KEYS } from "./CropSwitcher";

// The container. Owns which crop is selected, runs the query, and picks which
// of the four states from section 12 to render. It holds no formatting logic
// and no rules about numbers: the card decides whether a row can be shown at
// all, and refuses on its own terms.
//
// Farmers and merchants see the same component, the same query and the same
// numbers. Role is read in exactly one place below, to choose an opening crop,
// and never anywhere near a price.

// Per section 9.2, and per the brief before it. Also the answer whenever a
// follow or a listing names a crop that has no market row.
const FALLBACK_CROP_KEY = "robusta_cherry";

// A merchant opens on the crop their own active listings mention most often,
// because a merchant's screen should open on what they actually trade.
//
// Ties break in fixed catalogue order rather than in whatever order the feed
// happened to arrive in, so the same merchant with the same listings always
// opens on the same chip.
function merchantDefault(listings, merchantId) {
  if (!merchantId) return null;

  const counts = new Map();
  for (const listing of listings || []) {
    if (listing.merchant_id !== merchantId) continue;
    const cropKey = marketCropKeyForAppCrop(listing.crop_name);
    if (!cropKey) continue;
    counts.set(cropKey, (counts.get(cropKey) || 0) + 1);
  }

  let best = null;
  let bestCount = 0;
  for (const cropKey of CROP_KEYS) {
    const count = counts.get(cropKey) || 0;
    if (count > bestCount) {
      best = cropKey;
      bestCount = count;
    }
  }
  return best;
}

// A farmer opens on their most recent crop_follows row, because a follow is a
// deliberate statement of interest, where a listing is a business record.
//
// Walks newest first and takes the first follow that maps to a market crop, so
// a follow on Arecanut, which has no market row, falls through to the next one
// rather than to the fallback.
function farmerDefault(follows) {
  const newestFirst = [...(follows || [])].sort(
    (a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)
  );
  for (const follow of newestFirst) {
    const cropKey = marketCropKeyForAppCrop(follow.crop_name);
    if (cropKey) return cropKey;
  }
  return null;
}

export function MarketStrip({ profile }) {
  const { t } = useTranslation();
  const snapshotsQ = useMarketSnapshots();

  const isMerchant = profile?.role === "MERCHANT";
  // Both hooks are already running elsewhere on this page for these users, and
  // React Query dedupes on the key, so neither of these is an extra request.
  // Only the one matching the role is read below.
  const followsQ = useMyCropFollows();
  const listingsQ = useListings();

  const [cropKey, setCropKey] = useState(FALLBACK_CROP_KEY);

  // The default is applied once and never re-applied, so a user who taps a chip
  // is not yanked back to their follows when a refetch lands. Tapping a chip
  // also closes the window, which matters when the follows query is slower than
  // the user is.
  const defaultSettled = useRef(false);

  function chooseCrop(nextCropKey) {
    defaultSettled.current = true;
    setCropKey(nextCropKey);
  }

  useEffect(() => {
    if (defaultSettled.current) return;

    const source = isMerchant ? listingsQ.data : followsQ.data;
    // Undefined means the relevant query has not answered yet. An error leaves
    // it undefined forever, which is the documented outcome: the strip opens on
    // the fallback crop rather than on nothing.
    if (!source) return;

    defaultSettled.current = true;
    const picked = isMerchant
      ? merchantDefault(source, profile?.id)
      : farmerDefault(source);
    if (picked) setCropKey(picked);
  }, [isMerchant, listingsQ.data, followsQ.data, profile?.id]);

  const rows = snapshotsQ.data;
  const row = rows ? cpaRowForCrop(rows, cropKey) : null;

  return (
    <section className="mt-4" aria-label={t("market.heading")}>
      {/* Heading and intro render immediately in every state, including while
          loading. The user sees the feature exists rather than a grey slab. */}
      <h2 className="text-lg font-bold text-ink-900">{t("market.heading")}</h2>
      <p className="mt-0.5 text-sm text-ink-500">{t("market.intro")}</p>

      {/* The chips are static and need no query, so they render and stay
          tappable through loading, error and both empty states. */}
      <div className="mt-3">
        <CropSwitcher value={cropKey} onChange={chooseCrop}/>
      </div>

      <div className="mt-3">
        {snapshotsQ.isLoading ? (
          <div
            className="h-44 animate-pulse rounded-[18px] border border-ink-200 bg-white p-6 shadow-sm"
            aria-label={t("market.loading")}
            data-state="loading"
          />
        ) : snapshotsQ.isError ? (
          <div
            className="rounded-[18px] border border-ink-200 bg-white p-6 shadow-sm"
            data-state="error"
          >
            <LoadError onRetry={() => snapshotsQ.refetch()}/>
          </div>
        ) : !rows || rows.length === 0 ? (
          // Query succeeded, nothing came back. The sentence says the app is
          // fine and when to come back, which is the work it is doing here.
          <div
            className="rounded-[18px] border border-ink-200 bg-white p-6 text-sm text-ink-500 shadow-sm"
            data-state="empty-all"
          >
            {t("market.emptyAll")}
          </div>
        ) : canRenderPrice(row) ? (
          <div data-state="populated">
            <MarketPriceCard row={row}/>
          </div>
        ) : (
          // Rows exist but this crop has none, or the one it has cannot state
          // its own date and source. Both are the same thing to a reader: no
          // price for this crop today. The card refusing a row is not a hole in
          // the layout, it is this sentence.
          <div
            className="rounded-[18px] border border-ink-200 bg-white p-6 text-sm text-ink-500 shadow-sm"
            data-state="empty-crop"
          >
            {t("market.emptyCrop", { crop: t(`market.crop.${cropKey}`) })}
          </div>
        )}
      </div>
    </section>
  );
}
