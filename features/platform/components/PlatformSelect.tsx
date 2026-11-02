"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PlatformSelectOption = { value: string; label: string; hint?: string; disabled?: boolean };

type Props = {
  options: ReadonlyArray<PlatformSelectOption>;
  /** Controlled value. Leave undefined and pass `defaultValue` for an uncontrolled GET-form filter. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  id?: string;
  /** Submitted with the surrounding form through a hidden input. */
  name?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  disabled?: boolean;
  /** Block form submission until a non-empty value is chosen (browser validation, like <select required>). */
  required?: boolean;
  /** Submit the surrounding form as soon as a value is chosen (GET filters). */
  submitOnChange?: boolean;
  /** A search box above the list; on by default for long lists. */
  searchable?: boolean;
  size?: "sm" | "md";
  className?: string;
};

/**
 * The platform's select: a field-shaped trigger that opens a popover list (Radix Popover),
 * used instead of a native <select> so phones get the same list, type and touch targets.
 */
export function PlatformSelect({
  options,
  value,
  defaultValue = "",
  onValueChange,
  id,
  name,
  placeholder = "Select",
  disabled = false,
  required = false,
  submitOnChange = false,
  searchable,
  size = "md",
  className,
  ...aria
}: Props) {
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const hiddenRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const autoId = React.useId();
  const triggerId = id ?? autoId;
  const withSearch = searchable ?? options.length > 12;
  const selected = options.find((option) => option.value === current);
  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter((option) => `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(needle)) : options;

  function choose(next: string) {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
    setOpen(false);
    if (submitOnChange && hiddenRef.current) {
      hiddenRef.current.value = next;
      hiddenRef.current.form?.requestSubmit();
    }
  }

  function optionButtons() {
    return Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]:not(:disabled)") ?? []);
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    const items = optionButtons();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => { event.preventDefault(); items[Math.max(0, Math.min(items.length - 1, to))]?.focus(); };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") { if (index <= 0 && withSearch) { event.preventDefault(); searchRef.current?.focus(); } else move(index - 1); }
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
  }

  return (
    <>
      {name && required ? (
        // A real (visually hidden) input so the browser's required check still runs; focus goes to the trigger.
        <input ref={hiddenRef} name={name} value={current} required tabIndex={-1} aria-hidden="true" onChange={() => {}} onFocus={() => document.getElementById(triggerId)?.focus()} className="pointer-events-none absolute h-px w-px opacity-0" />
      ) : name ? <input ref={hiddenRef} type="hidden" name={name} value={current} /> : null}
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            id={triggerId}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-haspopup="listbox"
            aria-label={aria["aria-label"]}
            aria-invalid={aria["aria-invalid"] || undefined}
            aria-describedby={aria["aria-describedby"]}
            className={cn(
              "flex w-full min-w-0 items-center justify-between gap-2 rounded-[6px] border border-input bg-background px-3 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive",
              size === "sm" ? "h-9" : "h-10",
              className,
            )}
          >
            <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="w-[var(--radix-popover-trigger-width)] min-w-[12rem] max-w-[calc(100vw-1.5rem)] rounded-[6px] p-1"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (withSearch) { searchRef.current?.focus(); return; }
            const items = optionButtons();
            (items.find((item) => item.getAttribute("aria-selected") === "true") ?? items[0])?.focus();
          }}
        >
          {withSearch ? (
            <div className="relative border-b p-1 pb-2">
              <Search className="pointer-events-none absolute left-3.5 top-[calc(50%-0.25rem)] size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); optionButtons()[0]?.focus(); }
                  if (event.key === "Enter") { event.preventDefault(); const first = shown.find((option) => !option.disabled); if (first) choose(first.value); }
                }}
                placeholder="Search"
                aria-label="Search options"
                className="h-9 w-full rounded-[6px] border border-input bg-background pl-8 pr-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
          ) : null}
          <div ref={listRef} id={listId} role="listbox" aria-label={aria["aria-label"]} onKeyDown={onListKeyDown} className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {shown.length === 0 ? <p className="px-2.5 py-2 text-sm text-muted-foreground">No matches</p> : null}
            {shown.map((option) => {
              const isSelected = option.value === current;
              return (
                <button
                  key={option.value || "__empty"}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => choose(option.value)}
                  ref={(node) => { if (node && isSelected && open && !withSearch) node.scrollIntoView({ block: "nearest" }); }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-[4px] px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50 aria-selected:font-medium"
                >
                  <Check className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 break-words">{option.label}</span>
                  {option.hint ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{option.hint}</span> : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
