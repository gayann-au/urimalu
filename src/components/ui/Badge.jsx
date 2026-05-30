const tones = {
  fresh:    "bg-emerald-100 text-emerald-800",
  warn:     "bg-amber-100 text-amber-800",
  stale:    "bg-red-100 text-red-800",
  approved: "bg-emerald-100 text-emerald-800",
  pending:  "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
  neutral:  "bg-gray-100 text-gray-700",
  blue:     "bg-blue-100 text-blue-800",
  purple:   "bg-purple-100 text-purple-800",
  coorg:    "bg-coorg-100 text-coorg-800",
};

export function Badge({ tone = "neutral", className = "", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tones[tone] || tones.neutral} ${className}`}>
      {children}
    </span>
  );
}