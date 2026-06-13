import { useTranslation } from "react-i18next";
import { freshnessStatus } from "../../lib/freshness";

// Colour per severity, using the app's existing Tailwind palette.
const SEVERITY_COLOR = {
  fresh: "text-green-600",
  aging: "text-amber-600",
  overdue: "text-amber-700",
  stale: "text-red-600",
};

// Small freshness pill: an icon plus a relative-time label, both coloured by
// severity. The label text comes from the shared freshnessStatus helper so the
// by-crop card and the profile listing stay in sync.
export function FreshnessBadge({ confirmedAt, className = "" }) {
  const { t } = useTranslation();
  const { key, params, severity } = freshnessStatus(confirmedAt);
  const color = SEVERITY_COLOR[severity] || SEVERITY_COLOR.aging;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap ${color} ${className}`}>
      <SeverityIcon severity={severity} />
      <span>{t(key, params)}</span>
    </span>
  );
}

function SeverityIcon({ severity }) {
  const props = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  if (severity === "fresh") {
    // Check mark
    return (
      <svg {...props}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (severity === "aging") {
    // Clock
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  // overdue and stale: warning triangle (colour distinguishes the two)
  return (
    <svg {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
