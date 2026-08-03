import { useTranslation } from "react-i18next";

// The small chilli label above each section heading.
//
// Lifted from the landing page, which opens every section with an eyebrow
// ("For merchants", "For farmers", "Both sides") before the headline. The
// market strip had headings sitting straight on the page with nothing above
// them, which is a large part of why it read as a different product from the
// page that sells it.
//
// The chilli dot is the one place brand colour touches this feature. It is on
// a section label, never on or near a figure, so it cannot be read as saying
// anything about whether a price is good or bad.
//
// Not reused from LandingPage.css because that stylesheet scopes everything
// under .uri-landing, so its .eyebrow rule does not apply outside the landing.
// The values here are the same idea rebuilt on the shared Tailwind tokens.
export function SectionEyebrow({ labelKey }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-chilli-700">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-chilli-500"/>
      {t(labelKey)}
    </span>
  );
}
