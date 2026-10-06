export const FRONT_DESK_DATA_DOCUMENT = `
  query FrontDeskData($query: String) {
    frontDeskWorkspace(query: $query)
  }
`;
