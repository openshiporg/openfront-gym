import { tenantFilter, tenantItemAccess } from "./access/tenantPolicy";

export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
    onboardingStatus?: string
    organization?: { id: string; name?: string } | null
    role: {
      id: string
      name: string
      canCreateRecords: boolean
      canManageAllRecords: boolean
      canSeeOtherPeople: boolean
      canEditOtherPeople: boolean
      canManagePeople: boolean
      canManageRoles: boolean
      canAccessDashboard: boolean
      canManageOnboarding: boolean
      canManageSettings: boolean
      canManageAppointments?: boolean
      canManageFacilities?: boolean
      canManagePrograms?: boolean
      canManageCommunications?: boolean
      canManageRetail?: boolean
      canManagePayroll?: boolean
      canViewReports?: boolean
      isInstructor: boolean
    }
  }
}

type AccessArgs = {
  session?: Session
}

function isOperatorSession(session?: Session) {
  return session?.data.role?.canManageAllRecords ?? false
}

function ownerFilter(session: Session | undefined, filter: Record<string, unknown>) {
  if (!session) return false
  return tenantFilter(
    { session },
    isOperatorSession(session) ? undefined : filter,
  )
}

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session)
}

export const permissions = {
  canCreateRecords: ({ session }: AccessArgs) => session?.data.role?.canCreateRecords ?? false,
  canManageAllRecords: ({ session }: AccessArgs) => isOperatorSession(session),
  canManagePeople: ({ session }: AccessArgs) => session?.data.role?.canManagePeople ?? false,
  canManageRoles: ({ session }: AccessArgs) => session?.data.role?.canManageRoles ?? false,
  canAccessDashboard: ({ session }: AccessArgs) => session?.data.role?.canAccessDashboard ?? false,
  canManageOnboarding: ({ session }: AccessArgs) => session?.data.role?.canManageOnboarding ?? false,
  canManageSettings: ({ session }: AccessArgs) => session?.data.role?.canManageSettings ?? false,
  canManageAppointments: ({ session }: AccessArgs) => session?.data.role?.canManageAppointments ?? false,
  canManageFacilities: ({ session }: AccessArgs) => session?.data.role?.canManageFacilities ?? false,
  canManagePrograms: ({ session }: AccessArgs) => session?.data.role?.canManagePrograms ?? false,
  canManageCommunications: ({ session }: AccessArgs) => session?.data.role?.canManageCommunications ?? false,
  canManageRetail: ({ session }: AccessArgs) => session?.data.role?.canManageRetail ?? false,
  canManagePayroll: ({ session }: AccessArgs) => session?.data.role?.canManagePayroll ?? false,
  canViewReports: ({ session }: AccessArgs) => session?.data.role?.canViewReports ?? false,
  isInstructor: ({ session }: AccessArgs) => session?.data.role?.isInstructor ?? false,
}

export const rules = {
  canReadOwnUser: ({ session }: AccessArgs) => {
    if (!session) return false
    const narrower = isOperatorSession(session) ? undefined : { id: { equals: session.itemId } }
    return tenantFilter({ session }, narrower)
  },

  canReadOwnMember: ({ session }: AccessArgs) => {
    if (!session) return false
    const narrower = isOperatorSession(session)
      ? undefined
      : { user: { id: { equals: session.itemId } } }
    return tenantFilter({ session }, narrower)
  },

  canReadOwnMembership: ({ session }: AccessArgs) =>
    ownerFilter(session, { member: { id: { equals: session?.itemId } } }),

  canReadOwnMemberResource: ({ session }: AccessArgs) =>
    ownerFilter(session, { member: { user: { id: { equals: session?.itemId } } } }),

  canReadOwnPaymentSession: ({ session }: AccessArgs) =>
    ownerFilter(session, { user: { id: { equals: session?.itemId } } }),

  canReadOwnPaymentSessionField: ({ session, item }: AccessArgs & { item?: any }) =>
    Boolean(session && (isOperatorSession(session) || item?.userId === session.itemId)),

  canReadOwnMemberField: ({ session, item }: AccessArgs & { item?: any }) =>
    Boolean(
      session &&
      tenantItemAccess({ session, item }) &&
      (isOperatorSession(session) || item?.userId === session.itemId)
    ),

  canReadOwnWorkoutSet: ({ session }: AccessArgs) =>
    ownerFilter(session, {
      workoutLog: { member: { user: { id: { equals: session?.itemId } } } },
    }),

  canReadOwnBooking: ({ session }: AccessArgs) => {
    if (!session) return false
    const memberFilter = { member: { user: { id: { equals: session.itemId } } } }
    if (isOperatorSession(session)) return tenantFilter({ session })
    if (!session.data.role?.isInstructor) return tenantFilter({ session }, memberFilter)

    return tenantFilter({ session }, {
      OR: [
        memberFilter,
        { classInstance: { instructor: { user: { id: { equals: session.itemId } } } } },
        {
          classInstance: {
            classSchedule: { instructor: { user: { id: { equals: session.itemId } } } },
          },
        },
      ],
    })
  },

  canReadOwnAttendance: ({ session }: AccessArgs) => {
    if (!session) return false
    const memberFilter = { member: { user: { id: { equals: session.itemId } } } }
    if (isOperatorSession(session)) return tenantFilter({ session })
    if (!session.data.role?.isInstructor) return tenantFilter({ session }, memberFilter)

    return tenantFilter({ session }, {
      OR: [
        memberFilter,
        { classSchedule: { instructor: { user: { id: { equals: session.itemId } } } } },
      ],
    })
  },

  canReadOwnWaitlist: ({ session }: AccessArgs) => {
    if (!session) return false
    const memberFilter = { member: { user: { id: { equals: session.itemId } } } }
    if (isOperatorSession(session)) return tenantFilter({ session })
    if (!session.data.role?.isInstructor) return tenantFilter({ session }, memberFilter)

    return tenantFilter({ session }, {
      OR: [
        memberFilter,
        { classSchedule: { instructor: { user: { id: { equals: session.itemId } } } } },
      ],
    })
  },

  canReadOwnRole: ({ session }: AccessArgs) => {
    if (!session) return false
    const narrower = isOperatorSession(session)
      ? undefined
      : { assignedTo: { some: { id: { equals: session.itemId } } } }
    return tenantFilter({ session }, narrower)
  },

  canReadClassSchedule: ({ session }: AccessArgs) =>
    tenantFilter(
      { session },
      isOperatorSession(session) ? undefined : { isActive: { equals: true } },
    ),

  canReadInstructor: ({ session }: AccessArgs) =>
    tenantFilter(
      { session },
      isOperatorSession(session) ? undefined : { isActive: { equals: true } }
    ),

  canReadClassInstance: ({ session }: AccessArgs) =>
    tenantFilter(
      { session },
      isOperatorSession(session) ? undefined : { isCancelled: { equals: false } },
    ),

  // Backward-compatible aliases for the existing User/Member update boundaries.
  canReadPeople: ({ session }: AccessArgs) => {
    if (!session) return false
    return tenantFilter(
      { session },
      isOperatorSession(session) ? undefined : { id: { equals: session.itemId } }
    )
  },
  canUpdatePeople: ({ session }: AccessArgs) => {
    if (!session) return false
    return tenantFilter(
      { session },
      isOperatorSession(session) ? undefined : { id: { equals: session.itemId } }
    )
  },
  canDeletePeople: ({ session }: AccessArgs) => {
    if (!session || !session.data?.role?.canManagePeople) return false
    // Delete is always tenant-bound, including for global-capability operators.
    return tenantFilter({ session })
  },
}
