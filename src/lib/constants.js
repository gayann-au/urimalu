export const ROLES = { FARMER: "FARMER", MERCHANT: "MERCHANT", ADMIN: "ADMIN" };
export const MERCHANT_STATUS = { ACTIVE: "ACTIVE", PENDING: "PENDING", APPROVED: "APPROVED", REJECTED: "REJECTED" };
export const LEAD_TYPES = { VIEW: "VIEW", SHOW_NUMBER: "SHOW_NUMBER", WHATSAPP: "WHATSAPP", CALL: "CALL" };

// Column lists for every read of the users table. select("*") on users fails
// for anon and authenticated since the column-level grants in
// supabase/migrations/20260612000001_users_select_lockdown.sql — these lists
// must stay in sync with the GRANT SELECT statements there.
// PUBLIC is what the anon role may read; AUTHED adds contact fields and the
// own-profile / admin-screen fields granted to the authenticated role.
export const USER_COLUMNS_PUBLIC =
  "id, role, status, is_disabled, business_name, town, district, created_at";
export const USER_COLUMNS_AUTHED =
  USER_COLUMNS_PUBLIC +
  ", phone, whatsapp, email" +
  ", full_name, owner_name, years_trading, business_type, crops_traded" +
  ", business_description, rejection_reason, resubmitted_at";

export const DISTRICTS = ["Kodagu", "Chikmagalur", "Hassan", "Other"];

export const DELIVERY_POINTS = ["Virajpet", "Gonikoppal", "Kushalnagar", "Madikeri", "Somwarpet", "Ponnampet", "Suntikoppa"];

export const PAYMENT_MODES = [
  { value: "cash",      labelKey: "paymentMode.cash" },
  { value: "neft_rtgs", labelKey: "paymentMode.neft_rtgs" },
  { value: "cheque",    labelKey: "paymentMode.cheque" },
  { value: "upi",       labelKey: "paymentMode.upi" },
];

export const YEARS_TRADING = [
  { value: "lt1",  labelKey: "years.lt1" },
  { value: "1-3",  labelKey: "years.1-3" },
  { value: "3-5",  labelKey: "years.3-5" },
  { value: "5+",   labelKey: "years.5+" },
];

export const BUSINESS_TYPES = [
  { value: "individual",   labelKey: "bizType.individual" },
  { value: "partnership",  labelKey: "bizType.partnership" },
  { value: "pvt_ltd",      labelKey: "bizType.pvt_ltd" },
  { value: "cooperative",  labelKey: "bizType.cooperative" },
];

export const CROPS_TRADED = ["coffee", "pepper", "cardamom", "arecanut"];

// Unit options for the listing form. kg is the weight in kg for one unit.
// null kg means the merchant enters a custom weight.
export const UNIT_OPTIONS = [
  { label: "per kg",    kg: 1    },
  { label: "50kg bag",  kg: 50   },
  { label: "75kg bag",  kg: 75   },
  { label: "100kg bag", kg: 100  },
  { label: "quintal",   kg: 100  },
  { label: "custom",    kg: null },
];

// Common crop names shown as autocomplete hints and quick-filter chips.
// Any free-text name is also accepted.
export const DEFAULT_CROP_SUGGESTIONS = [
  "Robusta Cherry",
  "Arabica Cherry",
  "Robusta Parchment",
  "Arabica Parchment",
  "Pepper",
  "Cardamom",
];

export const AUTO_APPROVE_HOURS = 24;
export const AUTO_APPROVE_MS = AUTO_APPROVE_HOURS * 60 * 60 * 1000;

// ---------- Helpers ----------

export function pendingMsLeft(merchant) {
  if (!merchant || merchant.status !== "PENDING") return 0;
  const created = parseTs(merchant.resubmitted_at ?? merchant.created_at);
  if (created == null) return 0;
  return Math.max(0, AUTO_APPROVE_MS - (Date.now() - created));
}

function parseTs(v) {
  if (v == null) return null;
  const t = typeof v === "number" ? v : Date.parse(v);
  return isNaN(t) ? null : t;
}

export function formatINR(v) {
  if (v == null || v === "" || isNaN(Number(v))) return "-";
  return "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// Returns price / unitKg, or null if either value is missing or unitKg is zero.
// Used for instant per-kg display before a listing row is saved.
export function computePricePerKg(price, unitKg) {
  const p = Number(price);
  const u = Number(unitKg);
  if (!price || isNaN(p) || p <= 0) return null;
  if (!unitKg || isNaN(u) || u === 0) return null;
  return p / u;
}

// Weight chips for the "see total for a bag" helper on the by-crop card.
export const BAG_WEIGHTS = [25, 50, 75, 100];

// Decide how a listing's price should be shown. Pure data, no UI or i18n.
//   mode "call":  call for price, show the call-for-price text
//   mode "perkg": single per-kg hero number (per-kg priced, or a custom unit)
//   mode "unit":  the entered price is the hero (bag or quintal), perKg below
// Never returns the literal unit "per kg" for the "unit" branch, so callers
// can prefix "per" without ever producing "per per kg".
export function listingPriceView(item) {
  if (!item || item.call_for_price) return { mode: "call" };
  const unitLabel = (item.unit_label || "").trim();
  const isCustom = unitLabel.toLowerCase() === "custom";
  const isPerKg = unitLabel.toLowerCase() === "per kg" || Number(item.unit_kg) === 1;
  const perKg = item.price_per_kg != null ? item.price_per_kg : null;
  if (isPerKg || isCustom) {
    const hero = perKg != null ? perKg : item.price;
    return { mode: "perkg", hero, perKg };
  }
  return { mode: "unit", hero: item.price, perKg, unitLabel };
}

// Returns true if the listing has a usable price or a call-for-price flag.
export function listingHasPrice(listing) {
  if (!listing) return false;
  if (listing.call_for_price) return true;
  return listing.price != null && Number(listing.price) > 0;
}

// Groups a flat array of listing rows by merchant_id.
// Only includes listings where is_active is true.
// Within each merchant, listings are sorted by crop_name alphabetically.
export function groupListingsByMerchant(listings) {
  const map = new Map();
  for (const l of listings) {
    if (!l.is_active) continue;
    if (!map.has(l.merchant_id)) map.set(l.merchant_id, []);
    map.get(l.merchant_id).push(l);
  }
  const result = [];
  for (const [merchant_id, rows] of map) {
    rows.sort((a, b) => a.crop_name.localeCompare(b.crop_name));
    result.push({ merchant_id, listings: rows });
  }
  return result;
}

export function formatTime12(t24) {
  if (!t24) return "";
  const [hStr, mStr] = String(t24).split(":");
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return t24;
  const m = (mStr || "00").padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function formatDuration(ms) {
  if (ms <= 0) return "0m";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function staleness(postedAt) {
  const t = typeof postedAt === "number" ? postedAt : Date.parse(postedAt);
  const diff = Date.now() - t;
  const HR = 60 * 60 * 1000;
  const DAY = 24 * HR;
  if (diff < HR)       return { level: "fresh", key: "stale.justNow",   meta: {} };
  if (diff < DAY)      return { level: "fresh", key: "stale.hoursAgo",  meta: { n: Math.max(1, Math.floor(diff / HR)) } };
  if (diff < 2 * DAY)  return { level: "warn",  key: "stale.yesterday", meta: {} };
  return                      { level: "stale", key: "stale.daysAgo",   meta: { n: Math.floor(diff / DAY) } };
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function lastNDays(n = 7) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

// Format a valid_till value as DD/MM/YYYY with zero padding, built explicitly
// from the date parts so the output never varies by device locale. Date only
// strings and ISO timestamps both reuse their leading YYYY-MM-DD, which avoids
// any timezone shift. Returns "" for empty or unparseable values. Shared by the
// merchant profile and the feed card so both render valid_till identically.
export function formatValidTill(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return `${dd}/${mm}/${yyyy}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${String(d.getFullYear())}`;
}

// Indian mobile validation
export const phoneRegex = /^[6-9]\d{9}$/;
