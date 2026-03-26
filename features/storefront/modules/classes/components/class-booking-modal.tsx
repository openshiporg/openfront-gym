"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Users, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { bookClass } from "@/features/storefront/lib/actions/classes";

type ClassBookingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  classData: {
    id: string;          // ClassInstance.id
    name: string;
    instructor: string;
    time: string;
    duration: number;
    spots: number;
    capacity: number;
    difficulty?: string;
    date?: string;
  };
  onBookingSuccess?: () => void;
};

export default function ClassBookingModal({
  isOpen,
  onClose,
  classData,
  onBookingSuccess,
}: ClassBookingModalProps) {
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleBook = () => {
    startTransition(async () => {
      const res = await bookClass(classData.id);
      if (res.success) {
        setResult({ success: true, message: `Booked! You have ${res.creditsRemaining === -1 ? "unlimited" : res.creditsRemaining} credit(s) remaining.` });
        router.refresh();
        onBookingSuccess?.();
      } else {
        setResult({ success: false, message: res.error });
      }
    });
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  const spotsLeft = classData.spots;
  const isFull = spotsLeft === 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book class</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Class info */}
          <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
            <p className="font-semibold">{classData.name}</p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {classData.time} · {classData.duration} min
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {isFull ? (
                  <span className="text-red-600 font-medium">Full</span>
                ) : (
                  <span className={spotsLeft <= 3 ? "text-amber-600 font-medium" : ""}>
                    {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
                  </span>
                )}
              </span>
            </div>
            {classData.instructor && (
              <p className="text-xs text-muted-foreground">with {classData.instructor}</p>
            )}
          </div>

          {/* Result feedback */}
          {result && (
            <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
              result.success
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {result.success
                ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              {result.message}
            </div>
          )}

          {/* Actions */}
          {!result?.success && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleBook}
                disabled={isPending || isFull}
                className="flex-1"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isFull ? "Join waitlist" : "Confirm booking"}
              </Button>
            </div>
          )}
          {result?.success && (
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
