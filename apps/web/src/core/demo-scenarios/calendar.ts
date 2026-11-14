import { zonedInput } from "@/lib/zoned"

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
  /**
   * An event with every row of brief C2 (ADR-0099): today's token audit review,
   * whose organizer set it in New York time, held in the studio with a Zoom for
   * whoever is remote, 20 minutes away, with an alert. Changed through the
   * demo's own update, as the person would change it in the form.
   */
  "event-call": ({ client }) => {
    const zone = "America/New_York"
    const now = Math.floor(Date.now() / 1000)
    void client
      .listOccurrences(now - 86_400, now + 86_400)
      .then((list) => list.find((o) => o.title === "Token audit review"))
      .then(async (o) => {
        if (!o) return
        const e = await client.getEvent(o.eventId, o.start)
        await client.updateEvent(e.eventId, {
          calendarId: e.calendarId,
          title: e.title,
          location: "Studio, room 4",
          notes: e.notes,
          allDay: false,
          start: zonedInput(e.start, zone),
          end: zonedInput(e.end, zone),
          timeZone: zone,
          travel: 20,
          repeat: e.repeat,
          reminders: [10],
        })
      })
  },
}
