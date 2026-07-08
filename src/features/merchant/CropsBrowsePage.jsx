import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { LoadError } from "../../components/ui/LoadError";
import { FollowCropButton } from "../alerts/FollowCropButton";
import { useListings, uniqueCropsInFeed } from "../feed/useFeed";
import { useUriMotion } from "../../lib/uiMotion";
import { formatINR } from "../../lib/constants";

// Crop discovery list for merchants. Farmers browse crops through the feed's
// By Crop tab; merchants never see the feed, so this page gives them the same
// underlying data as a plain list: every distinct crop currently listed, how
// many merchants are buying it, the going per-kg range, and the Stage 1 follow
// star for price alerts. Deliberately no search, filters, or sorting: it is a
// discovery list, not a dashboard. The data layer is reused verbatim from the
// farmer feed (useListings + uniqueCropsInFeed); only this thin list rendering
// is new.
export default function CropsBrowsePage() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const listingsQ = useListings();
  const items = listingsQ.data || [];

  // One row per distinct crop, in the same alphabetical order the feed uses.
  // Price info comes from active listings only (useListings already filters):
  // the min and max price per kg across merchants, and the merchant count.
  // Call-for-price listings count toward merchants but not toward the range.
  const rows = useMemo(() => {
    const crops = uniqueCropsInFeed(items);
    return crops.map((crop) => {
      const forCrop = items.filter((i) => i.crop_name === crop);
      const merchants = new Set(forCrop.map((i) => i.merchant_id)).size;
      const prices = forCrop
        .filter((i) => !i.call_for_price && i.price_per_kg != null)
        .map((i) => Number(i.price_per_kg))
        .filter((n) => !isNaN(n));
      const min = prices.length ? Math.min(...prices) : null;
      const max = prices.length ? Math.max(...prices) : null;
      return { crop, merchants, min, max };
    });
  }, [items]);

  return (
    <div className="flex flex-col flex-1 pb-10 w-full mx-auto max-w-screen-md px-4 md:px-6">
      <Header showBack title={t("cropsBrowse.title")}/>

      <motion.section variants={m.stagger} initial="hidden" animate="show" className="py-6">
        <motion.h1 variants={m.fadeUp} className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-chilli-700">
          {t("cropsBrowse.title")}
        </motion.h1>
        <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1">{t("cropsBrowse.sub")}</motion.p>
      </motion.section>

      {listingsQ.isError ? (
        <LoadError onRetry={() => listingsQ.refetch()}/>
      ) : listingsQ.isLoading ? (
        <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 animate-pulse h-24"/>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-8 text-center text-ink-500">
          {t("cropsBrowse.none")}
        </div>
      ) : (
        <motion.ul variants={m.stagger} initial="hidden" animate="show" className="space-y-3">
          {rows.map(({ crop, merchants, min, max }) => (
            <motion.li key={crop} variants={m.fadeUp}
              className="bg-white rounded-3xl border border-ink-200 shadow-sm p-5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-display font-extrabold text-lg text-ink-900 leading-tight truncate">{crop}</div>
                <div className="text-xs text-ink-500 mt-0.5">
                  {merchants === 1
                    ? t("cropsBrowse.merchantsOne")
                    : t("cropsBrowse.merchantsN", { count: merchants })}
                </div>
                <div className="text-sm font-extrabold text-coorg-700 mt-1 tabular-nums">
                  {min == null
                    ? t("card.callForPrice")
                    : min === max
                      ? t("cropsBrowse.single", { price: formatINR(min) })
                      : t("cropsBrowse.range", { min: formatINR(min), max: formatINR(max) })}
                </div>
              </div>
              <FollowCropButton cropName={crop}/>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
