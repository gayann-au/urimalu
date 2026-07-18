import { COUNTRY_OPTIONS } from "../../lib/phone";

// Phone or whatsapp entry: a country picker plus the number box. The picker is a
// native <select> (fast and accessible on cheap Android, no custom dropdown JS)
// listing every country as "Name (+code)". India is preselected through the
// form's default value, not here. Both parts register into react-hook-form; the
// schema validates and the submit normalizes against the chosen country.
// countryReg and numberReg are the results of register("...Country") and
// register("...number"). Styling matches the shared Input: same radius, border,
// focus colour, and error treatment, so this is not a redesign.
export function PhoneField({ label, countryReg, numberReg, error, disabled }) {
  const base =
    "rounded-xl border-2 py-3 text-base bg-white outline-none transition disabled:bg-gray-50 disabled:text-gray-500";
  const state = error
    ? "border-red-300 focus:border-red-500"
    : "border-gray-200 focus:border-coorg-500";
  return (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      )}
      <div className="flex gap-2">
        <select
          {...countryReg}
          disabled={disabled}
          aria-label="Country code"
          className={`${base} ${state} w-2/5 shrink-0 px-2`}
        >
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          {...numberReg}
          type="tel"
          inputMode="numeric"
          disabled={disabled}
          placeholder="Mobile number"
          aria-invalid={!!error}
          className={`${base} ${state} flex-1 min-w-0 px-4`}
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
