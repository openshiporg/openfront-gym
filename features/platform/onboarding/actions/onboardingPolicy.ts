export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "dismissed";

const ALLOWED_TRANSITIONS: Record<OnboardingStatus, Set<OnboardingStatus>> = {
  not_started: new Set(["in_progress", "dismissed"]),
  in_progress: new Set(["in_progress", "dismissed"]),
  dismissed: new Set(["in_progress", "dismissed"]),
  completed: new Set(["completed"]),
};

export function assertOnboardingTransition(
  current: OnboardingStatus,
  next: OnboardingStatus
) {
  if (next === "completed") {
    throw new Error(
      "Completed is reserved for the authoritative completion check."
    );
  }
  if (!ALLOWED_TRANSITIONS[current]?.has(next)) {
    throw new Error(`Onboarding transition ${current} -> ${next} is not allowed.`);
  }
}
