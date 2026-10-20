export const ROSTER_SESSIONS_DOCUMENT = `
  query RosterSessions($q: String, $state: String, $from: String, $to: String, $sort: String, $skip: Int) {
    rosterSessions(q: $q, state: $state, from: $from, to: $to, sort: $sort, skip: $skip)
  }
`;

export const ROSTER_DETAIL_DOCUMENT = `
  query RosterDetail($classInstanceId: ID!, $confirmedSkip: Int, $waitlistSkip: Int, $otherSkip: Int) {
    rosterDetail(classInstanceId: $classInstanceId, confirmedSkip: $confirmedSkip, waitlistSkip: $waitlistSkip, otherSkip: $otherSkip)
  }
`;

export const MARK_CLASS_ATTENDANCE_DOCUMENT = `
  mutation MarkClassAttendance(
    $bookingId: ID!
    $outcome: String!
    $minutesLate: Int
    $notes: String
  ) {
    markClassAttendance(
      bookingId: $bookingId
      outcome: $outcome
      minutesLate: $minutesLate
      notes: $notes
    ) { id }
  }
`;

export const PROMOTE_FROM_WAITLIST_DOCUMENT = `
  mutation PromoteFromWaitlist($classInstanceId: ID!) {
    promoteFromWaitlist(classInstanceId: $classInstanceId) {
      promoted
      message
      booking { id }
    }
  }
`;
