import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { toast } from "../../components/ui/Toast";
import { useUpdateOwnProfile } from "./useAccount";
import { DISTRICTS, phoneRegex } from "../../lib/constants";

// Farmer self-edit form. Same fields and validation as the farmer signup and
// onboarding (name, phone, district), prefilled from the current profile, with
// a self-update instead of a create. Email and role are not editable here.
const schema = z.object({
  fullName: z.string().min(2, "auth.fullName"),
  phone: z.string().regex(phoneRegex, "auth.phoneInvalid"),
  district: z.string(),
});

export default function AccountFarmerForm({ profile }) {
  const { t } = useTranslation();
  const update = useUpdateOwnProfile();
  const [topError, setTopError] = useState(null);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: profile.full_name || "",
      phone: profile.phone || "",
      district: profile.district || DISTRICTS[0],
    },
  });

  async function onSubmit(values) {
    setTopError(null);
    try {
      await update.mutateAsync({
        userId: profile.id,
        patch: {
          full_name: values.fullName.trim(),
          phone: values.phone.trim(),
          district: values.district || null,
        },
      });
      toast({ text: t("account.saved") });
    } catch (e) {
      setTopError(e.message?.startsWith("account.") ? e.message : "account.saveError");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input label={t("auth.fullName")} {...register("fullName")}
        error={errors.fullName ? t(errors.fullName.message) : null}/>
      <Input label={t("auth.phone")} type="tel" placeholder="98XXXXXXXX" {...register("phone")}
        error={errors.phone ? t(errors.phone.message) : null}/>
      <Select label={t("auth.district")} {...register("district")}>
        {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
      </Select>
      {topError && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">
          {t(topError)}
        </div>
      )}
      <Button type="submit" loading={update.isPending} className="w-full">
        {update.isPending ? t("common.loading") : t("common.save")}
      </Button>
    </form>
  );
}
