import { forwardRef } from "react";

const variants = {
  primary:   "bg-coorg-600 text-white hover:bg-coorg-700 shadow-sm",
  outline:   "bg-white border-2 border-coorg-600 text-coorg-700 hover:bg-coorg-50",
  ghost:     "text-coorg-700 hover:bg-coorg-50",
  danger:    "bg-red-600 text-white hover:bg-red-700",
  amber:     "bg-amber-500 text-white hover:bg-amber-600",
  emerald:   "bg-emerald-600 text-white hover:bg-emerald-700",
  whatsapp:  "bg-[#25D366] text-white hover:bg-emerald-600",
  subtle:    "bg-gray-100 text-gray-700 hover:bg-gray-200",
  // Calm secondary action: white with a warm ink border. For non-destructive
  // choices like Reject (open the reason form), Dismiss, and Cancel.
  neutral:   "bg-white border-2 border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-paper-2",
  // Quiet destructive: chilli outline rather than a loud red block. For Remove
  // and Disable, so the destructive option is present but never shouts.
  dangerSoft:"bg-white border-2 border-chilli-200 text-chilli-700 hover:bg-chilli-50",
  // Committed negative action, the brand red. For confirming a rejection.
  chilli:    "bg-chilli-600 text-white hover:bg-chilli-700",
};
const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3.5 text-base",
};

export const Button = forwardRef(function Button(
  { variant = "primary", size = "md", className = "", loading = false, disabled, children, ...rest }, ref
) {
  const cls = `inline-flex items-center justify-center gap-2 font-semibold rounded-[14px] transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] ${variants[variant]} ${sizes[size]} ${className}`;
  return (
    <button ref={ref} disabled={disabled || loading} className={cls} {...rest}>
      {loading && (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4"/>
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
        </svg>
      )}
      {children}
    </button>
  );
});