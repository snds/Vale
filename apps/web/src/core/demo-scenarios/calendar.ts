import type { DemoScenarios } from "../demo-scenarios"

/** Calendar (ADR-0081): calendars, events and booking links in states the sample data doesn't reach. */
export const calendar: DemoScenarios = {
  /** Every calendar hidden from the list (ADR-0098): the calendar says so, and offers the list back. */
  "all-hidden": ({ client }) => {
    // Hidden as the person hides them, by the demo's own switch, so showing one again works as it would.
    void client.listCollections("calendar").then((list) => Promise.all(list.map((c) => client.setCollectionHidden(c.id, true))))
  },
  /** Events that never arrive: the views' loading state (ADR-0098). */
  "calendar-loading": ({ wrap }) => {
    wrap("listOccurrences", () => () => new Promise(() => {}))
  },
}
