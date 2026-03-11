export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
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
      isInstructor: boolean
    }
  }
}

type AccessArgs = {
  session?: Session
}

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session)
}

export const permissions = {
  canCreateRecords: ({ session }: AccessArgs) => session?.data.role?.canCreateRecords ?? false,
  canManageAllRecords: ({ session }: AccessArgs) => session?.data.role?.canManageAllRecords ?? false,
  canManagePeople: ({ session }: AccessArgs) => session?.data.role?.canManagePeople ?? false,
  canManageRoles: ({ session }: AccessArgs) => session?.data.role?.canManageRoles ?? false,
  canAccessDashboard: ({ session }: AccessArgs) => session?.data.role?.canAccessDashboard ?? false,
  canManageOnboarding: ({ session }: AccessArgs) => session?.data.role?.canManageOnboarding ?? false,
  isInstructor: ({ session }: AccessArgs) => session?.data.role?.isInstructor ?? false,
}

export const rules = {
  canReadRecords: ({ session }: AccessArgs) => {
    if (!session) return false

    if (session.data.role?.canManageAllRecords) {
      return true // Admins see everything
    }

    if (session.data.role?.isInstructor) {
      // Instructors can see records (Classes/Bookings) linked to them
      return {
        OR: [
          { instructor: { user: { id: { equals: session.itemId } } } },
          { classSchedule: { instructor: { user: { id: { equals: session.itemId } } } } },
          { member: { user: { id: { equals: session.itemId } } } }
        ]
      }
    }

    return { id: { equals: session.itemId } } // Default to self
  },
  canManageRecords: ({ session }: AccessArgs) => {
    if (!session) return false

    if (session.data.role?.canManageAllRecords) return true

    if (session.data.role?.isInstructor) {
      // Instructors can manage their own class instances (mark attendance)
      return {
        OR: [
          { instructor: { user: { id: { equals: session.itemId } } } },
          { classInstance: { instructor: { user: { id: { equals: session.itemId } } } } }
        ]
      }
    }

    return { id: { equals: session.itemId } }
  },
  canReadPeople: ({ session }: AccessArgs) => {
    if (!session) return false

    if (session.data.role?.canSeeOtherPeople) return true

    return { id: { equals: session.itemId } }
  },
  canUpdatePeople: ({ session }: AccessArgs) => {
    if (!session) return false

    if (session.data.role?.canEditOtherPeople) return true

    return { id: { equals: session.itemId } }
  },
}
