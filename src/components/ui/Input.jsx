import { forwardRef } from "react";

export const Input = forwardRef(function Input(
  { label, error, help, className = "", containerClassName = "", ...rest }, ref
) {
  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      )}
      <input
        ref={ref}
        className={`w-full rounded-xl border-2 px-4 py-3 text-base bg-white transition outline-none disabled:bg-gray-50 disabled:text-gray-500
          ${error ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-coorg-500"} ${className}`}
        aria-invalid={!!error}
        {...rest}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {help && !error && <p className="text-[11px] text-gray-500 italic mt-1">{help}</p>}
    </div>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, error, help, maxLength, value, className = "", ...rest }, ref
) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      )}
      <textarea
        ref={ref}
        value={value}
        maxLength={maxLength}
        className={`w-full rounded-xl border-2 px-4 py-3 text-base bg-white outline-none
          ${error ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-coorg-500"} ${className}`}
        {...rest}
      />
      <div className="flex items-center justify-between mt-1">
        {error ? <p className="text-xs text-red-600">{error}</p>
              : help ? <p className="text-[11px] text-gray-500 italic">{help}</p> : <span/>}
        {maxLength != null && (
          <span className="text-[10px] text-gray-400 ml-auto">{(value || "").length}/{maxLength}</span>
        )}
      </div>
    </div>
  );
});

export const Select = forwardRef(function Select(
  { label, error, help, children, className = "", ...rest }, ref
) {
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>}
      <select
        ref={ref}
        className={`w-full rounded-xl border-2 px-4 py-3 text-base bg-white outline-none
          ${error ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-coorg-500"} ${className}`}
        {...rest}
      >{children}</select>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {help && !error && <p className="text-[11px] text-gray-500 italic mt-1">{help}</p>}
    </div>
  );
});