"use client";

import { useActionState, useState } from "react";
import { MailPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldInput, FormField, Notice } from "@/features/platform/components/platform-ui";
import {
  inviteMemberAction,
  type InviteMemberState,
} from "../actions/members";

const initialState: InviteMemberState = {
  status: "idle",
  message: null,
  email: null,
};

export function MemberInviteForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(inviteMemberAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <MailPlus aria-hidden /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            Invite sends a password-setup link; membership starts after purchase.
          </DialogDescription>
        </DialogHeader>

        {state.message ? (
          <Notice tone={state.status === "error" ? "danger" : state.status === "requested" ? "positive" : "warning"}>
            {state.message}
          </Notice>
        ) : null}

        <form action={action} className="grid gap-4">
          <FormField label="Full name">
            <FieldInput name="name" required maxLength={120} autoComplete="off" placeholder="Alex Rivera" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Email">
              <FieldInput name="email" required type="email" maxLength={254} autoComplete="off" placeholder="alex@example.com" />
            </FormField>
            <FormField label="Phone" optional>
              <FieldInput name="phone" maxLength={40} autoComplete="off" placeholder="(555) 010-0199" />
            </FormField>
          </div>
          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create and invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
