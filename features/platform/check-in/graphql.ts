export const FRONT_DESK_DATA_DOCUMENT = `
  query FrontDeskData($where: MemberWhereInput) {
    members(where: $where, take: 10, orderBy: [{ joinDate: desc }]) {
      id
      name
      email
      phone
      status
      lastCheckIn
      membershipTier { id name }
      user {
        id
        membership {
          id
          status
          classCreditsRemaining
          tier { id name }
        }
      }
    }
    checkIns(take: 12, orderBy: [{ checkInTime: desc }]) {
      id
      checkInTime
      checkOutTime
      method
      membershipValidated
      member { id name email }
      location { id name }
    }
    locations(where: { isActive: { equals: true } }, orderBy: [{ name: asc }]) {
      id
      name
    }
    gymSettings: gymSettingsItems(take: 1) {
      timezone
      organization { timezone }
    }
  }
`;
