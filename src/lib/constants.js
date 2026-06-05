export const ROLES = { FARMER: "FARMER", MERCHANT: "MERCHANT", ADMIN: "ADMIN" };
export const MERCHANT_STATUS = { ACTIVE: "ACTIVE", PENDING: "PENDING", APPROVED: "APPROVED", REJECTED: "REJECTED" };
export const LEAD_TYPES = { VIEW: "VIEW", SHOW_NUMBER: "SHOW_NUMBER", WHATSAPP: "WHATSAPP", CALL: "CALL" };

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

// Coffee sections. Each section has a label, color, optional hint, and an array of fields.
export const COFFEE_SECTIONS = [
  {
    key: "rc_new",
    label: "Robusta Cherry (New)",
    color: "amber",
    fields: [
      { key: "rc_ep_price",        label: "EP Rate (₹/kg)",         type: "number", placeholder: "362" },
      { key: "rc_spot_lift_price", label: "Spot Lift Price (₹/kg)", type: "number", placeholder: "363", optional: true, hint: "Only if different from EP rate" },
      { key: "rc_delivery_price",  label: "Delivery Price (₹/kg)",  type: "number", placeholder: "363", optional: true, hint: "Only if different from EP rate" },
      { key: "rc_moisture_pct",    label: "Moisture %",             type: "number", placeholder: "13.5", optional: true },
      { key: "rc_spot_lifting",    label: "Spot Lifting Available", type: "boolean" },
    ]
  },
  {
    key: "rc_old",
    label: "Robusta Cherry (Old Stock)",
    color: "orange",
    hint: "Last season's unsold stock",
    fields: [
      { key: "rc_old_ep_price",     label: "EP Rate (₹/kg)",         type: "number", placeholder: "355" },
      { key: "rc_old_spot_lifting", label: "Spot Lifting Available", type: "boolean" },
    ]
  },
  {
    key: "ot",
    label: "OT Rate",
    color: "yellow",
    hint: "Outturn-based pricing. Post the OT rate per kg. Farmer's outturn % determines final bag price.",
    fields: [
      { key: "ot_price", label: "OT Rate (₹/kg)", type: "number", placeholder: "400" },
    ]
  },
  {
    key: "ac",
    label: "Arabica Cherry",
    color: "green",
    fields: [
      { key: "ac_price",          label: "Price per bag (₹/50kg)", type: "number", placeholder: "12000" },
      { key: "ac_call_for_price", label: "Call for price",         type: "boolean", hint: "Turn on if you prefer farmers to call instead of posting a number" },
    ]
  },
  {
    key: "ap",
    label: "Arabica Parchment",
    color: "emerald",
    fields: [
      { key: "ap_price", label: "Price per quintal (₹/100kg)", type: "number", placeholder: "23400" },
    ]
  },
  {
    key: "rp",
    label: "Robusta Parchment",
    color: "lime",
    fields: [
      { key: "rp_price", label: "Price per quintal (₹/100kg)", type: "number", placeholder: "18200" },
    ]
  },
  {
    key: "pepper",
    label: "Pepper",
    color: "red",
    fields: [
      { key: "pepper_price",          label: "Price (₹/kg)",   type: "number", placeholder: "695" },
      { key: "pepper_call_for_price", label: "Call for price", type: "boolean", hint: "Turn on if you prefer farmers to call instead of posting a number" },
    ]
  },
  {
    key: "cardamom",
    label: "Cardamom",
    color: "purple",
    fields: [
      { key: "cardamom_price", label: "Price (₹/kg)", type: "number", placeholder: "2150" },
    ]
  },
];

// All crop chips on the feed.
export const CROP_CHIPS = [
  { id: "all",      label: "All",      match: (r) => rateHasAnyPrice(r) },
  { id: "rc",       label: "RC",       match: (r) => r.rc_ep_price != null },
  { id: "ac",       label: "AC",       match: (r) => r.ac_price != null },
  { id: "ap",       label: "AP",       match: (r) => r.ap_price != null },
  { id: "rp",       label: "RP",       match: (r) => r.rp_price != null },
  { id: "ot",       label: "OT",       match: (r) => r.ot_price != null },
  { id: "pepper",   label: "Pepper",   match: (r) => r.pepper_price != null },
  { id: "cardamom", label: "Cardamom", match: (r) => r.cardamom_price != null },
];

export const AUTO_APPROVE_HOURS = 24;
export const AUTO_APPROVE_MS = AUTO_APPROVE_HOURS * 60 * 60 * 1000;

// ---------- Helpers ----------
export function getEffectiveStatus(merchant) {
  if (!merchant) return null;
  if (merchant.status === "APPROVED") return "APPROVED";
  if (merchant.status === "REJECTED") return "REJECTED";
  if (merchant.status === "PENDING") {
    const created = parseTs(merchant.resubmitted_at ?? merchant.created_at);
    if (created != null && Date.now() - created >= AUTO_APPROVE_MS) return "APPROVED";
    return "PENDING";
  }
  return merchant.status;
}

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

export function rateHasAnyPrice(r) {
  if (!r) return false;
  return (
    r.rc_ep_price != null ||
    r.ac_price != null || r.ap_price != null || r.rp_price != null || r.ot_price != null ||
    r.pepper_price != null || r.cardamom_price != null
  );
}

export function latestRateByMerchant(rates) {
  const map = new Map();
  for (const r of rates) {
    if (r.active === false) continue;
    const ex = map.get(r.merchant_id);
    if (!ex || Date.parse(r.posted_at) > Date.parse(ex.posted_at)) map.set(r.merchant_id, r);
  }
  return [...map.values()];
}

export function formatINR(v) {
  if (v == null || v === "" || isNaN(Number(v))) return "-";
  return "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
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
  if (diff < HR)     return { level: "fresh", key: "stale.justNow",   meta: {} };
  if (diff < DAY)    return { level: "fresh", key: "stale.hoursAgo",  meta: { n: Math.max(1, Math.floor(diff / HR)) } };
  if (diff < 2 * DAY) return { level: "warn", key: "stale.yesterday", meta: {} };
  return                  { level: "stale", key: "stale.daysAgo",  meta: { n: Math.floor(diff / DAY) } };
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

// Indian mobile validation
export const phoneRegex = /^[6-9]\d{9}$/;