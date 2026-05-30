// This file is no longer used. Kept for reference. Safe to delete.
import { useTranslation } from "react-i18next";
import { Toggle } from "../../components/ui/Toggle";
import { DELIVERY_POINTS, CROP_CHIPS } from "../../lib/constants";
import { SearchIcon, FilterIcon } from "../../components/icons/Sprite";

export function FeedFilters({
  search, setSearch,
  cropChip, setCropChip,
  spotLiftOnly, setSpotLiftOnly,
  spotPayOnly, setSpotPayOnly,
  dpFilter, setDpFilter,
  sortBy, setSortBy,
  showFilters, setShowFilters,
  activeCount, isFiltered, onClear,
}) {
  const { t, i18n } = useTranslation();
  const kn = i18n.language === "kn" ? "kn" : "";
  return (
    <div className="bg-white border-b border-gray-100 sticky top-[64px] z-20">
      <div className="px-3 pt-3 relative">
        <SearchIcon /> {/* visual icon container would go here */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("feed.search")}
          className="w-full rounded-xl border-2 border-gray-200 focus:border-coorg-500 outline-none px-4 py-2.5 text-base"
        />
      </div>

      <div className="flex gap-2 px-3 pt-3 overflow-x-auto no-scrollbar">
        {CROP_CHIPS.map(c => (
          <button key={c.id} onClick={() => setCropChip(c.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition border min-h-[36px] ${
              cropChip === c.id
                ? "bg-coorg-600 text-white border-coorg-600 shadow"
                : "bg-white text-gray-700 border-gray-200"
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-3 py-3 gap-2 flex-wrap">
        <button onClick={() => setShowFilters((s) => !s)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${
            activeCount > 0 ? "border-coorg-500 text-coorg-700 bg-coorg-50" : "border-gray-200 text-gray-700 bg-white"
          }`}>
          <FilterIcon/>
          <span className={kn}>Filters</span>
          {activeCount > 0 && <span className="ml-1 rounded-full bg-coorg-600 text-white text-[10px] px-1.5">{activeCount}</span>}
        </button>

        {isFiltered && (
          <button onClick={onClear}
            className="rounded-full border border-orange-300 bg-orange-50 text-orange-700 px-3 py-1.5 text-xs font-bold hover:bg-orange-100">
            <span className={kn}>{t("common.clearFilters")}</span>
          </button>
        )}

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ml-auto">
          <option value="recent">{t("feed.sortRecent")}</option>
          <option value="rc">{t("feed.sortHighestRC")}</option>
          <option value="ac">{t("feed.sortHighestAC")}</option>
          <option value="pepper">{t("feed.sortHighestPepper")}</option>
        </select>
      </div>

      {showFilters && (
        <div className="px-3 pb-3 grid grid-cols-1 gap-3 border-t border-gray-100 pt-3">
          <Toggle label={t("feed.spotLiftOnly")} value={spotLiftOnly} onChange={setSpotLiftOnly}/>
          <Toggle label={t("feed.spotPayOnly")}  value={spotPayOnly}  onChange={setSpotPayOnly}/>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t("feed.deliveryPoint")}</label>
            <div className="flex flex-wrap gap-2">
              <Pill active={dpFilter === "any"} onClick={() => setDpFilter("any")}>{t("feed.any")}</Pill>
              {DELIVERY_POINTS.map(dp => (
                <Pill key={dp} active={dpFilter === dp} onClick={() => setDpFilter(dp)}>{dp}</Pill>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1.5 text-sm font-semibold border min-h-[36px] ${
      active ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
    }`}>{children}</button>
  );
}