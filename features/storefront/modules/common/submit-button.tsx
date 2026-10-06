"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({ children, pendingLabel = "Saving…", className = "sf-btn-primary", disabled = false }: { children: React.ReactNode; pendingLabel?: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={disabled || pending} aria-disabled={disabled || pending}>{pending ? pendingLabel : children}</button>;
}

export default SubmitButton;
