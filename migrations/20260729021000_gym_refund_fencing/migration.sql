-- Add a per-attempt claim token so stale workers cannot finalize a replacement claim.
ALTER TABLE "GymRefundAttempt"
  ADD COLUMN IF NOT EXISTS "claimToken" TEXT NOT NULL DEFAULT '';
