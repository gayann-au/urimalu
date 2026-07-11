import { forwardRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Password field with an inline show/hide toggle. The eye button is anchored to
// the input box itself (vertically centered on it), so it stays put even when a
// validation error renders below the field. The toggle is a 44x44 tap target.
// Forwards its ref to the input so react-hook-form register() works unchanged,
// and passes through any other input props (value, onChange, maxLength, etc.).
export const PasswordInput = forwardRef(function PasswordInput(
  { label, error, className = "", ...rest }, ref
) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      )}
      <div className="relative">
        <input
          ref={ref}
          type={show ? "text" : "password"}
          aria-invalid={!!error}
          className={`w-full rounded-xl border-2 pl-4 pr-12 py-3 text-base bg-white transition outline-none disabled:bg-gray-50 disabled:text-gray-500
            ${error ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-coorg-500"} ${className}`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={t(show ? "auth.hidePassword" : "auth.showPassword")}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 grid place-items-center text-ink-500 hover:text-ink-800"
        >
          {show ? <EyeIcon/> : <EyeOffIcon/>}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
});

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}
