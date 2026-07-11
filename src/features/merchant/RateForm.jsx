import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { Autocomplete } from "../../components/ui/Autocomplete";
import { Toggle } from "../../components/ui/Toggle";
import { Button } from "../../components/ui/Button";
import {
  UNIT_OPTIONS,
  cropSuggestions,
  computePricePerKg,
  formatINR,
  toTitleCaseCrop,
} from "../../lib/constants";

// Preprocessor: empty string or null -> null, otherwise coerce to number.
const numOpt = z.preprocess(
  (v) => (v === "" || v == null ? null : Number(v)),
  z.number().positive().max(9999999).nullable()
);

const schema = z
  .object({
    crop_name:      z.string().min(1, "Crop name is required"),
    unit_label:     z.string().min(1, "Unit is required"),
    unit_kg:        z.preprocess(
                      (v) => (v === "" || v == null ? null : Number(v)),
                      z.number().positive("Unit weight must be greater than 0").nullable()
                    ),
    call_for_price: z.boolean().default(false),
    price:          numOpt,
    variety_notes:  z.string().optional(),
    valid_till:     z.string().optional(),
    notes:          z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.call_for_price && (v.price == null || v.price <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Price is required",
        path: ["price"],
      });
    }
    if (v.unit_kg == null || v.unit_kg <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the weight in kg for this unit",
        path: ["unit_kg"],
      });
    }
  });

function fromListing(listing) {
  if (!listing) {
    return {
      crop_name:      "",
      unit_label:     UNIT_OPTIONS[0].label,
      unit_kg:        UNIT_OPTIONS[0].kg,
      call_for_price: false,
      price:          "",
      variety_notes:  "",
      valid_till:     "",
      notes:          "",
    };
  }
  return {
    crop_name:      listing.crop_name      || "",
    unit_label:     listing.unit_label     || UNIT_OPTIONS[0].label,
    unit_kg:        listing.unit_kg        ?? UNIT_OPTIONS[0].kg,
    call_for_price: !!listing.call_for_price,
    price:          listing.price          ?? "",
    variety_notes:  listing.variety_notes  || "",
    valid_till:     listing.valid_till     || "",
    notes:          listing.notes          || "",
  };
}

// Single-listing editor. Handles one crop row: new or existing.
// Does not touch the database itself. It calls onSave(cleanObject) and the parent writes.
export function RateForm({ listing, onSave, onCancel }) {
  const { t, i18n } = useTranslation();
  const knCls = i18n.language === "kn" ? "kn" : "";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: fromListing(listing),
  });

  // Re-hydrate when the listing prop changes (parent may open a different row).
  useEffect(() => {
    reset(fromListing(listing));
  }, [listing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const unitLabel     = watch("unit_label");
  const unitKg        = watch("unit_kg");
  const callForPrice  = watch("call_for_price");
  const priceVal      = watch("price");
  const cropNameVal   = watch("crop_name");
  const notesVal      = watch("notes") || "";
  const isCustomUnit  = unitLabel === "custom";

  // When the unit dropdown changes, auto-fill unit_kg from the option definition.
  // For "custom", clear unit_kg so the user fills it in.
  const { onChange: rhfUnitLabelChange, ...unitLabelRest } = register("unit_label");
  function handleUnitChange(e) {
    rhfUnitLabelChange(e);
    const opt = UNIT_OPTIONS.find((o) => o.label === e.target.value);
    if (opt && opt.kg !== null) {
      setValue("unit_kg", opt.kg, { shouldValidate: true });
    } else {
      setValue("unit_kg", "", { shouldValidate: true });
    }
  }

  // When call_for_price is toggled on, clear the price field.
  function handleCallForPriceToggle(val) {
    setValue("call_for_price", val, { shouldDirty: true });
    if (val) setValue("price", "", { shouldDirty: true, shouldValidate: true });
  }

  // Live per-kg preview shown below the price field.
  const perKg = !callForPrice ? computePricePerKg(priceVal, unitKg) : null;

  function onSubmit(values) {
    const out = {
      ...(listing?.id ? { id: listing.id } : {}),
      crop_name:      toTitleCaseCrop(values.crop_name),
      variety_notes:  values.variety_notes?.trim() || null,
      price:          values.call_for_price ? null : values.price,
      unit_label:     values.unit_label,
      unit_kg:        values.unit_kg,
      call_for_price: values.call_for_price,
      valid_till:     values.valid_till || null,
      notes:          values.notes?.trim() || null,
    };
    onSave(out);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Crop name */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Crop name
        </label>
        <Autocomplete
          placeholder="e.g. Robusta Cherry"
          maxLength={100}
          value={cropNameVal}
          onChange={(v) =>
            setValue("crop_name", v, { shouldValidate: true, shouldDirty: true })
          }
          getSuggestions={(q) => cropSuggestions(q, i18n.language)}
          error={errors.crop_name?.message}
          optionClassName={knCls}
        />
      </div>

      {/* Unit */}
      <div className="space-y-2">
        <Select
          label="Unit"
          onChange={handleUnitChange}
          {...unitLabelRest}
          error={errors.unit_label?.message}
        >
          {UNIT_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.label}>
              {opt.label}
            </option>
          ))}
        </Select>

        {/* Custom unit weight input. Shown only when "custom" is selected. */}
        {isCustomUnit && (
          <Input
            label="Weight per unit (kg)"
            type="number"
            inputMode="decimal"
            placeholder="e.g. 60"
            {...register("unit_kg")}
            error={errors.unit_kg?.message}
          />
        )}
      </div>

      {/* Call for price toggle */}
      <Toggle
        label="Call for price"
        value={callForPrice}
        onChange={handleCallForPriceToggle}
      />

      {/* Price. Hidden when call_for_price is on. */}
      {!callForPrice && (
        <div>
          <Input
            label={`Price (${unitLabel})`}
            type="number"
            inputMode="decimal"
            placeholder="e.g. 5000"
            {...register("price")}
            error={errors.price?.message}
          />
          {perKg != null && (
            <p className="text-xs text-gray-500 mt-1">
              = {formatINR(perKg)} per kg
            </p>
          )}
        </div>
      )}

      {/* Variety or quality notes */}
      <Input
        label="Variety or quality notes (optional)"
        placeholder="e.g. AB grade, current season"
        maxLength={200}
        {...register("variety_notes")}
      />

      {/* Valid till */}
      <Input
        label="Valid till (optional)"
        type="date"
        {...register("valid_till")}
      />

      {/* Notes */}
      <Textarea
        label="Notes (optional)"
        rows={2}
        placeholder="Any extra detail for farmers"
        maxLength={500}
        value={notesVal}
        {...register("notes")}
      />

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className={`min-h-[48px] rounded-xl border-2 border-gray-200 text-gray-700 font-semibold ${knCls}`}
        >
          {t("common.cancel")}
        </button>
        <Button type="submit" size="lg" loading={isSubmitting}>
          <span className={knCls}>
            {listing?.id ? "Update" : "Add crop"}
          </span>
        </Button>
      </div>
    </form>
  );
}
