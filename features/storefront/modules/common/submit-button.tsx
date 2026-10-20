"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  size,
  block = false,
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: Variant;
  size?: "sm" | "lg";
  block?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="sf-btn"
      data-variant={variant === "primary" ? undefined : variant}
      data-size={size}
      data-block={block || undefined}
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
    >
      {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

export default SubmitButton;
