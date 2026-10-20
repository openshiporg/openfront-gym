"use client";

import { useActionState } from "react";
import { DoorOpen, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/features/platform/components/platform-ui";
import { manualCheckIn, manualCheckOut, type FrontDeskActionState } from "../actions/check-in";

const idle: FrontDeskActionState = { status: "idle", message: null };

function Result({ state }: { state: FrontDeskActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-rose-700 dark:text-rose-400" : "text-xs text-emerald-700 dark:text-emerald-400"}>
      {state.message}
    </p>
  );
}

export function CheckInForm({
  memberId,
  memberName,
  locations,
  canCheckIn,
  blockedReason,
}: {
  memberId: string;
  memberName: string;
  locations: Array<{ id: string; name?: string | null }>;
  canCheckIn: boolean;
  blockedReason?: string;
}) {
  const [state, action, pending] = useActionState(manualCheckIn, idle);
  return (
    <form action={action} className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="method" value="manual" />
        <label className="min-w-0">
          <span className="sr-only">Check-in location for {memberName}</span>
          <NativeSelect name="locationId" defaultValue={locations[0]?.id ?? ""} className="sm:w-48">
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name || "Unnamed location"}</option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" disabled={!canCheckIn || pending} title={!canCheckIn ? blockedReason : undefined} className="sm:w-32">
          {!canCheckIn ? "Access blocked" : pending ? <><Loader2 className="animate-spin" aria-hidden /> Checking in</> : <><DoorOpen aria-hidden /> Check in</>}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function CheckOutForm({ checkInId, memberName }: { checkInId: string; memberName: string }) {
  const [state, action, pending] = useActionState(manualCheckOut, idle);
  return (
    <form action={action} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="checkInId" value={checkInId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Check out ${memberName}`}>
        <LogOut aria-hidden /> Out
      </Button>
      {state.status === "error" ? <Result state={state} /> : null}
    </form>
  );
}
