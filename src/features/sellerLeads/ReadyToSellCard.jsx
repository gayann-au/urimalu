import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Input, Textarea } from "../../components/ui/Input";
import { toast } from "../../components/ui/Toast";
import { InstallMoment } from "../../components/InstallMoment";
import { useUriMotion } from "../../lib/uiMotion";
import {
  MAX_ACTIVE_SELLER_LEADS,
  useMySellerLeads,
  useCreateSellerLead,
  useDeleteSellerLead,
} from "./useSellerLeads";

// Bullhorn glyph for the "Ready to Sell" CTA card.
function BullhornIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11v2a2 2 0 0 0 2 2h1l3 5v-9"/>
      <path d="M6 11 18 5v14L6 13"/>
      <path d="M21 9v6"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  );
}

// Farmer-facing "Ready to Sell" feature.
//
// WHY THERE ARE TWO TRIGGERS. This is the lead generator: it is how a farmer
// tells every merchant buying their crop that they have something to sell, and
// a farmer who never sees it never uses it. The inline card sits near the top
// of the feed and scrolls away in a second or two, after which the whole
// screen offers no way to start. So a floating trigger takes over exactly
// where the inline card leaves off.
//
// The two never show at once. The floating trigger appears only once the
// inline card has left the screen, so a farmer looking straight at the card is
// never also shown a button for the same thing.
//
// The floating trigger is deliberately not role gated inside this file. The
// whole component is already farmer only at its one call site in FeedPage, and
// a second copy of that test here would be a second thing to keep in step.
// Because it is fixed rather than in the document flow, it also survives the
// merchant and crop tab switch below it, which is the point: a farmer browsing
// merchant prices is a farmer deciding whether to sell.
export function ReadyToSellCard({ profile }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  // True once a lead has actually been written in this visit. Drives the
  // install ask in the inline section below, which is why it is not reset when
  // the sheet closes: the ask belongs in the page flow, where the farmer can
  // see it after the sheet is gone.
  const [justPosted, setJustPosted] = useState(false);

  // Whether the inline card has scrolled off. Drives the floating trigger.
  const [pastInline, setPastInline] = useState(false);
  // Shrunk to a pill by the reader. Never becomes "gone": see the note on the
  // pill branch below.
  const [dismissed, setDismissed] = useState(false);
  const inlineRef = useRef(null);

  const leadsQ = useMySellerLeads(profile?.id);
  const createLead = useCreateSellerLead();
  const deleteLead = useDeleteSellerLead();

  const leads = leadsQ.data || [];
  const atLimit = leads.length >= MAX_ACTIVE_SELLER_LEADS;

  // An observer rather than a scroll listener. A scroll handler fires on every
  // frame of every scroll and this is a phone on a hill connection, where the
  // main thread is the scarce thing. The observer wakes twice: once when the
  // card leaves, once when it comes back.
  useEffect(() => {
    const node = inlineRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only count the card leaving upward. Scrolled past means the reader
        // has moved down the feed and left it behind; a card still below the
        // fold on first paint is also "not intersecting", and showing the
        // floating button then would duplicate a card the reader is about to
        // scroll into.
        const goneUpward = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setPastInline(goneUpward);
      },
      { threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function openSheet() {
    setDescription("");
    setError(null);
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const trimmed = description.trim();
    if (!trimmed) {
      setError(t("sellerLeads.descriptionRequired"));
      return;
    }
    try {
      await createLead.mutateAsync({ farmerId: profile.id, description: trimmed });
      toast({ tone: "ok", text: t("sellerLeads.posted") });
      setDescription("");
      // Only after the write has actually resolved. The install ask below is
      // about merchants replying to this lead, and there is no lead to reply to
      // until this line is reached.
      setJustPosted(true);
    } catch (err) {
      toast({ tone: "err", text: err?.message || t("sellerLeads.postError") });
    }
  }

  async function remove(lead) {
    if (!confirm(t("sellerLeads.confirmDelete"))) return;
    try {
      await deleteLead.mutateAsync({ id: lead.id, farmerId: profile.id });
      toast({ tone: "ok", text: t("sellerLeads.deletedToast") });
    } catch (err) {
      toast({ tone: "err", text: err?.message || t("sellerLeads.deleteError") });
    }
  }

  return (
    <>
      <section className="pt-4" ref={inlineRef}>
        <motion.button
          type="button"
          onClick={openSheet}
          whileTap={m.btnTap}
          className="w-full flex items-center gap-3 rounded-3xl border-2 border-chilli-200 bg-chilli-50 hover:bg-chilli-100 transition-colors p-5 text-left shadow-uri-sm"
        >
          <span className="h-11 w-11 rounded-2xl bg-white text-chilli-600 grid place-items-center shrink-0">
            <BullhornIcon/>
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display font-extrabold text-base text-ink-900">
              {t("sellerLeads.cta")}
            </div>
            <div className="text-xs text-ink-500 mt-0.5">
              {t("sellerLeads.ctaSub")}
            </div>
          </div>
        </motion.button>

        {/* The lead moment. In the feed's own flow, under the inline card, and
            never inside the sheet: the sheet is a full screen overlay and an
            ask does not belong on top of the page. It shows only after a lead
            has really been written, and stands down when the bottom strip is
            already saying the same thing. */}
        <InstallMoment moment="lead" active={justPosted} className="mt-3"/>
      </section>

      {/* THE FLOATING TRIGGER.
          Bottom of the viewport, lifted clear of the home indicator by the
          safe area inset so it is not half under the bar on an iPhone, and
          clear of the install strip by --uri-install-h, which InstallBanner
          measures itself into and clears back to 0px whenever no strip is
          showing. Both are pinned to the same edge, and this is the one that
          moves: the trigger is how a farmer says they have something to sell,
          and an install nudge must never be the thing sitting on top of it.
          The 0px fallback is required, not decoration, because the property is
          simply absent on every page without a strip, and a calc() reading a
          missing var is thrown away whole.
          z-30 keeps it under the toast stack and the sheet, both at z-50, so a
          confirmation message is never hidden behind it, and above the install
          strip at z-20. */}
      <AnimatePresence>
        {pastInline && !open && (
          <motion.div
            className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom)+var(--uri-install-h,0px))] pointer-events-none"
            initial={m.reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={m.reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {dismissed ? (
              // DISMISSED IS SHRUNK, NEVER GONE.
              // The pill still says what it is in words and still opens the
              // sheet on tap, so dismissing costs the reader the prompt and
              // never the route. It sits at the right edge and is small enough
              // that the feed reads past it. There is deliberately no state
              // that removes this from the screen: a farmer who taps the cross
              // once in week one must not lose the way to sell for good.
              <motion.button
                type="button"
                onClick={openSheet}
                whileTap={m.btnTap}
                layout
                className="pointer-events-auto ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-full border border-chilli-200 bg-white/95 px-4 text-sm font-bold text-chilli-700 shadow-uri-md backdrop-blur"
              >
                <BullhornIcon size={16}/>
                {t("sellerLeads.floatingShort")}
              </motion.button>
            ) : (
              <motion.div
                layout
                className="pointer-events-auto flex items-center gap-1 rounded-full bg-chilli-600 pr-1 shadow-uri-chilli"
              >
                {/* A LABEL, NOT A BARE ICON. This audience includes people
                    with limited reading, and a lone bullhorn is a guess at
                    best. The words carry the meaning and the glyph supports
                    them, never the other way round. */}
                <motion.button
                  type="button"
                  onClick={openSheet}
                  whileTap={m.btnTap}
                  className="inline-flex min-h-[52px] items-center gap-2.5 rounded-full px-5 text-[15px] font-bold text-white"
                >
                  <BullhornIcon size={18}/>
                  {t("sellerLeads.floatingLabel")}
                </motion.button>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  aria-label={t("sellerLeads.floatingDismiss")}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-chilli-700 hover:text-white"
                >
                  <CloseIcon/>
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-5 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900">
                {t("sellerLeads.cta")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[44px] px-2 -mr-2 text-sm text-ink-500 underline"
              >
                {t("common.cancel")}
              </button>
            </div>

            {atLimit ? (
              <p className="text-sm text-ink-700 bg-paper-2 rounded-2xl p-4">
                {t("sellerLeads.limitReached", { max: MAX_ACTIVE_SELLER_LEADS })}
              </p>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <Input label={t("sellerLeads.nameLabel")} value={profile.full_name || ""} readOnly disabled/>
                <Input label={t("sellerLeads.phoneLabel")} value={profile.phone || ""} readOnly disabled/>
                <Textarea
                  label={t("sellerLeads.descriptionLabel")}
                  placeholder={t("sellerLeads.descriptionPh")}
                  value={description}
                  maxLength={500}
                  rows={4}
                  onChange={(e) => setDescription(e.target.value)}
                  error={error}
                />
                <Button type="submit" className="w-full" loading={createLead.isPending}>
                  {t("sellerLeads.submit")}
                </Button>
              </form>
            )}

            {leads.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500 mb-2">
                  {t("sellerLeads.yourLeadsHeading", { count: leads.length, max: MAX_ACTIVE_SELLER_LEADS })}
                </h3>
                <ul className="space-y-2">
                  {leads.map((lead) => (
                    <li key={lead.id} className="rounded-2xl border border-ink-200 p-4">
                      <p className="text-sm text-ink-900 break-words">{lead.description}</p>
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          variant="dangerSoft"
                          loading={deleteLead.isPending}
                          onClick={() => remove(lead)}
                        >
                          {t("common.delete")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
