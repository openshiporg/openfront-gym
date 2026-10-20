"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
] as const;

/** Light / Dark / Auto as a segmented control. Renders the server-safe "Auto" state until mounted. */
export default function ThemeSwitch({ night = false }: { night?: boolean }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const current = mounted ? theme || "system" : "system";
  return (
    <div className="sf-seg" data-tone={night ? "night" : undefined} role="group" aria-label="Colour theme">
      {OPTIONS.map((option) => (
        <button key={option.value} type="button" aria-pressed={current === option.value} onClick={() => setTheme(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
