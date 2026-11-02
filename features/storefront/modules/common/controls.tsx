"use client";

import { useState } from "react";
import { PlatformDateInput, PlatformDateTimeInput } from "@/features/platform/components/PlatformDateTime";
import { PlatformSelect, type PlatformSelectOption } from "@/features/platform/components/PlatformSelect";

/** Storefront-styled trigger: matches `.sf-field` inputs (48px, raised surface, storefront line colour). */
const trigger = "sf-trigger";

export function SfSelect({ name, options, defaultValue = "", required, label, onValueChange, submitOnChange }: { name?: string; options: PlatformSelectOption[]; defaultValue?: string; required?: boolean; label: string; onValueChange?: (value: string) => void; submitOnChange?: boolean }) {
  return <PlatformSelect name={name} options={options} defaultValue={defaultValue} required={required} aria-label={label} onValueChange={onValueChange} submitOnChange={submitOnChange} className={trigger} />;
}

export function SfDate({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return <PlatformDateInput name={name} aria-label={label} required={required} className={trigger} />;
}

export function SfDateTime({ name, label, required }: { name: string; label: string; required?: boolean }) {
  const [value, setValue] = useState("");
  return <PlatformDateTimeInput name={name} value={value} onChange={setValue} required={required} aria-label={label} className="sf-datetime" />;
}
