import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { Button } from "../../components/ui/Button";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { toast } from "../../components/ui/Toast";
import { LoadError } from "../../components/ui/LoadError";
import { useUriMotion } from "../../lib/uiMotion";
import { FEATURE_CATEGORIES } from "../../lib/constants";
import { useSubmitFeatureRequest, useMyFeatureRequests } from "./useFeatureRequests";

// Same form stack as the rest of the app: react-hook-form + zod validation with
// the shared Input/Select/Textarea. Title is capped at 100 characters and the
// description must be 20 to 1000, matching the feature_requests CHECK
// constraints. The Textarea renders the live character counter when given a
// maxLength and its current value.
const schema = z.object({
  category: z.string().min(1),
  title: z.string().trim().min(2, "feature.titleRequired").max(100),
  description: z.string().trim().min(20, "feature.minChars").max(1000),
});

export default function FeatureRequestPage() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const submit = useSubmitFeatureRequest();
  const myRequests = useMyFeatureRequests();
  const [topError, setTopError] = useState(null);
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { category: FEATURE_CATEGORIES[0].value, title: "", description: "" },
  });
  const description = watch("description") || "";

  async function onSubmit(values) {
    setTopError(null);
    try {
      await submit.mutateAsync(values);
      toast({ tone: "ok", text: t("feature.submitted") });
      reset({ category: FEATURE_CATEGORIES[0].value, title: "", description: "" });
    } catch (e) {
      setTopError("feature.submitError");
    }
  }

  const requests = myRequests.data || [];

  return (
    <div className="flex flex-col flex-1 items-center isolate">
      <GlowBackdrop/>
      <Header showBack title={t("feature.title")}/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        <motion.div variants={m.stagger} initial="hidden" animate="show" className="mb-6">
          <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">{t("feature.title")}</motion.h2>
          <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">{t("feature.sub")}</motion.p>
        </motion.div>

        <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Select label={t("feature.category")} {...register("category")}>
              {FEATURE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
            </Select>
            <Input label={t("feature.titleLabel")} maxLength={100} placeholder={t("feature.titlePh")}
              {...register("title")} error={errors.title ? t(errors.title.message) : null}/>
            <Textarea label={t("feature.description")} placeholder={t("feature.descriptionPh")}
              rows={5} maxLength={1000} {...register("description")} value={description}
              error={errors.description ? t(errors.description.message) : null}/>
            {topError && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">{t(topError)}</div>}
            <Button type="submit" loading={submit.isPending} className="w-full">
              {submit.isPending ? t("common.loading") : t("feature.submit")}
            </Button>
          </form>
        </motion.div>

        <section className="mt-8">
          <h3 className="font-display text-lg font-extrabold tracking-tight text-ink-900 mb-3">{t("feature.myRequests")}</h3>
          {myRequests.isError ? (
            <LoadError onRetry={() => myRequests.refetch()}/>
          ) : myRequests.isLoading ? (
            <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-4 animate-pulse h-16"/>
          ) : requests.length === 0 ? (
            <p className="text-sm text-ink-500">{t("feature.noneYet")}</p>
          ) : (
            <ul className="space-y-3">
              {requests.map(r => {
                const cat = FEATURE_CATEGORIES.find(c => c.value === r.category);
                return (
                  <li key={r.id} className="bg-white rounded-2xl border border-ink-200 shadow-sm p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-coorg-700">{cat ? t(cat.labelKey) : r.category}</span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{t(`feature.status${r.status}`, r.status)}</span>
                    </div>
                    <div className="font-bold text-ink-900 mt-1 break-words">{r.title}</div>
                    <p className="text-sm text-ink-600 mt-1 whitespace-pre-wrap break-words">{r.description}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
