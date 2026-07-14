import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Input, Textarea } from "../../components/ui/Input";
import { toast } from "../../components/ui/Toast";
import {
  MAX_ACTIVE_SELLER_LEADS,
  useMySellerLeads,
  useCreateSellerLead,
  useDeleteSellerLead,
} from "./useSellerLeads";

// Bullhorn glyph for the "Ready to Sell" CTA card.
function BullhornIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11v2a2 2 0 0 0 2 2h1l3 5v-9"/>
      <path d="M6 11 18 5v14L6 13"/>
      <path d="M21 9v6"/>
    </svg>
  );
}

// Farmer-facing "Ready to Sell" feature: a CTA card on the feed that opens a
// bottom sheet with a short post form (name/phone read only from the
// profile, a required description) and, below it, the farmer's own active
// leads with a delete button on each. Hidden entirely once 5 leads are
// active, matching the 5-active-lead limit enforced in the database.
export function ReadyToSellCard({ profile }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);

  const leadsQ = useMySellerLeads(profile?.id);
  const createLead = useCreateSellerLead();
  const deleteLead = useDeleteSellerLead();

  const leads = leadsQ.data || [];
  const atLimit = leads.length >= MAX_ACTIVE_SELLER_LEADS;

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
      <section className="pt-4">
        <button
          type="button"
          onClick={openSheet}
          className="w-full flex items-center gap-3 rounded-3xl border-2 border-crop-200 bg-crop-50 hover:bg-crop-100 transition-colors p-5 text-left"
        >
          <span className="h-11 w-11 rounded-2xl bg-white text-crop-700 grid place-items-center shrink-0">
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
        </button>
      </section>

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
