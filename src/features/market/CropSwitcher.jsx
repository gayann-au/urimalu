import { useTranslation } from "react-i18next";
import { MARKET_CROP_APP_NAMES } from "../../lib/marketCrops";

// The six chips, in fixed catalogue order.
//
// The order is read from the committed MARKET_CROP_APP_NAMES map rather than
// written out again here, so there is no second list to drift from the first.
// Object key order is insertion order for string keys, and that map is written
// in the order these chips are meant to appear.
//
// This order is fixed and never sorted. Not by price, not by how recent the
// data is, not by which crop has a row today. Ordering chips by anything about
// the numbers would rank crops for the reader, which is a verdict, and this
// feature does not give verdicts.
export const CROP_KEYS = Object.keys(MARKET_CROP_APP_NAMES);

// Selection is presentational state only. The colour below says which chip is
// active, which is a fact about the interface, and says nothing about the price
// behind it. No chip is ever marked to suggest a crop is worth looking at.
export function CropSwitcher({ value, onChange }) {
  const { t } = useTranslation();

  return (
    <div className="-mx-1 overflow-x-auto">
      <div
        role="group"
        aria-label={t("market.pickCrop")}
        className="flex min-w-max gap-2 px-1 pb-1"
      >
        {CROP_KEYS.map((cropKey) => {
          const isSelected = cropKey === value;
          return (
            <button
              key={cropKey}
              type="button"
              onClick={() => onChange(cropKey)}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? "min-h-[44px] shrink-0 rounded-full bg-coorg-600 px-4 text-sm font-bold text-white transition-colors"
                  : "min-h-[44px] shrink-0 rounded-full border border-ink-200 bg-white px-4 text-sm font-bold text-ink-700 transition-colors hover:border-ink-300"
              }
            >
              {t(`market.crop.${cropKey}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
