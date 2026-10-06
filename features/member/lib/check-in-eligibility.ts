export function memberCheckInUnavailableReason(memberStatus?: string | null, membershipStatus?: string | null) {
  if (memberStatus !== "active") return "Your member account must be active before a check-in code is available.";
  if (membershipStatus !== "active") return "An active membership is required before a check-in code is available.";
  return null;
}
