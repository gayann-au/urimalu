// One source of truth for phone number handling, backed by libphonenumber-js.
// Uses the "mobile" metadata bundle: every field here is a mobile number (phone
// and whatsapp), so the mobile bundle validates them strictly (it rejects, for
// example, an Indian number that does not start 6-9) while staying far smaller
// than the full "max" bundle, keeping the app light on cheap Android phones over
// weak rural signal. Replaces the old India only normalizeIndianMobile and
// phoneRegex so nothing is left half using two approaches.
import {
  isValidPhoneNumber,
  parsePhoneNumber,
  getCountries,
  getCountryCallingCode,
} from "libphonenumber-js/mobile";

// Default country, since most users are Indian. Preselected on every phone and
// whatsapp field; any country in COUNTRY_OPTIONS can be chosen instead.
export const DEFAULT_PHONE_COUNTRY = "IN";

// Country display names come from the built in Intl.DisplayNames, with a safe
// fallback to the ISO code if the runtime lacks it.
const regionNames =
  typeof Intl !== "undefined" && Intl.DisplayNames
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function countryName(iso) {
  try {
    return regionNames?.of(iso) || iso;
  } catch {
    return iso;
  }
}

// Every calling country as { iso, code, name, label }, sorted by name, to
// populate the country picker. Built once at module load. India is made the
// default by the field, not by reordering this list.
export const COUNTRY_OPTIONS = getCountries()
  .map((iso) => {
    const code = getCountryCallingCode(iso);
    const name = countryName(iso);
    return { iso, code, name, label: `${name} (+${code})` };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// True when raw is a valid phone number for the given country. Used by the form
// schemas in place of a hand written per country rule.
export function isValidPhone(raw, country) {
  const s = String(raw ?? "").trim();
  if (!s || !country) return false;
  try {
    return isValidPhoneNumber(s, country);
  } catch {
    return false;
  }
}

// Normalize raw to E.164 storage form (a plus sign, the country dial code, then
// the digits, no spaces or dashes) for the given country, or null if it is not
// a valid number for that country. Every phone and whatsapp write goes through
// this. Existing +91 values already stored stay valid, so no new migration.
export function normalizePhone(raw, country) {
  const s = String(raw ?? "").trim();
  if (!isValidPhone(s, country)) return null;
  try {
    return parsePhoneNumber(s, country).number;
  } catch {
    return null;
  }
}

// Reverse of normalizePhone: split a stored E.164 number back into its country
// and national digits, to prefill an edit screen. A stored +919876543210
// becomes { country: "IN", national: "9876543210" }, so the picker shows India
// and the number box shows just the digits, without the country code doubled
// up. Falls back to the default country if the value cannot be parsed.
export function splitPhone(e164) {
  const s = String(e164 ?? "").trim();
  if (!s) return { country: DEFAULT_PHONE_COUNTRY, national: "" };
  try {
    const pn = parsePhoneNumber(s);
    if (pn && pn.country) return { country: pn.country, national: pn.nationalNumber };
  } catch {
    // unparseable, fall through to the default
  }
  return { country: DEFAULT_PHONE_COUNTRY, national: s.replace(/[^0-9]/g, "") };
}
