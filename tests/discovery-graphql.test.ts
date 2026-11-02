import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { serializeClassCalendar } from "../features/keystone/lib/class-calendar";

test("partner discovery has no REST routes; the GraphQL API carries it", () => {
  for (const route of ["bookings", "calendar", "classes"]) {
    assert.equal(existsSync(`app/api/discovery/${route}/route.ts`), false, route);
  }
  const schema = readFileSync("schema.graphql", "utf8");
  assert.match(schema, /discoveryClasses\(credential: String!/);
  assert.match(schema, /discoveryClassCalendar\(credential: String!.*\): String!/);
  assert.match(schema, /discoveryBookClass\(credential: String!/);
});

test("the class calendar skips sessions without a real end and escapes text", () => {
  const ics = serializeClassCalendar({
    organizationId: "org1",
    classes: [
      { instanceId: "a", startsAt: "2026-11-02T09:00:00Z", endsAt: "2026-11-02T10:00:00Z", schedule: { name: "Yoga, flow; easy" }, location: { name: "Main" } },
      { instanceId: "b", startsAt: "2026-11-02T09:00:00Z", endsAt: null, schedule: { name: "Open" } },
    ],
  }, new Date("2026-11-01T00:00:00Z"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /UID:org1-a@openfront-gym/);
  assert.match(ics, /SUMMARY:Yoga\\, flow\\; easy/);
  assert.match(ics, /DTSTART:20261102T090000Z\r\nDTEND:20261102T100000Z/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});
