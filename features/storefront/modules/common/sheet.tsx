"use client";

import { useRef, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/**
 * Storefront sheet: a bottom sheet on phones and a centred dialog from 640px. Built directly on
 * Radix Dialog so focus trapping, Escape and focus return stay native.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  role,
  dismissible = true,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  dismissible?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (next || dismissible) onOpenChange(next); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="sf-portal sf-overlay" />
        <DialogPrimitive.Content
          className="sf-portal sf-sheet"
          {...(role ? { role } : {})}
          {...(description ? {} : { "aria-describedby": undefined })}
          ref={contentRef}
          // Open on the sheet itself, not its first control: a focus ring on an unselected toggle
          // reads as the selected one, and focusing a field would raise the phone keyboard.
          onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus(); }}
          onCloseAutoFocus={onCloseAutoFocus}
          onPointerDownOutside={(event) => { if (!dismissible) event.preventDefault(); }}
          onEscapeKeyDown={(event) => { if (!dismissible) event.preventDefault(); }}
        >
          <div className="sf-sheet-scroll">
            <div className="sf-sheet-head">
              <DialogPrimitive.Title className="sf-sheet-title">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="sf-sheet-when">{description}</DialogPrimitive.Description> : null}
            </div>
            {children}
          </div>
          {dismissible ? (
            <DialogPrimitive.Close className="sf-icon-btn sf-sheet-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const SheetClose = DialogPrimitive.Close;
