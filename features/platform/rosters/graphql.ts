export const ROSTER_SESSIONS_DOCUMENT = `
  query RosterSessions { rosterSessions }
`;

export const ROSTER_DETAIL_DOCUMENT = `
  query RosterDetail($classInstanceId: ID!) {
    rosterDetail(classInstanceId: $classInstanceId)
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
