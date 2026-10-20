export const FRONT_DESK_DATA_DOCUMENT = `
  query FrontDeskData($query: String, $visitQuery: String, $visitLocationId: ID, $visitOrder: String, $visitSkip: Int) {
    frontDeskWorkspace(query: $query, visitQuery: $visitQuery, visitLocationId: $visitLocationId, visitOrder: $visitOrder, visitSkip: $visitSkip)
  }
`;
