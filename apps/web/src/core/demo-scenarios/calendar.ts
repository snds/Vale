import { zonedInput } from "@/lib/zoned"

import type { BookingLinkInput, DueReminder } from "../types"
import type { Demo, DemoScenarios } from "../demo-scenarios"

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
  /**
   * A reminder comes due (ADR-0100; brief X5): the next event today with a
   * place, its alert set 30 minutes before. The demo's clock does not move,
   * so the core's own check never fires one; this hands the watcher one, once.
   */
  "reminder-due": (demo) => dueOnce(demo, false),
  /** Time to leave (ADR-0029) for the same event: its travel time starts now. */
  "reminder-leave": (demo) => dueOnce(demo, true),
  /**
   * Two booking links (ADR-0101; brief C7), as on a gateway, so a link can be
   * copied. Their pages keep one address from run to run:
   * `/book/4f1c9a7e2b6d4e8a9c3f5b7d1e2a6c48` is the intro call.
   */
  "booking-links": (demo) => {
    demo.flags.gatewayOwner = true
    bookingLinks(demo)
  },
  /** The intro call booked by Rui Costa: its change page is `/book/<intro>/b/9b2e7c4a1f6d3e8b5a0c2d4f6e8a1b3c`. */
  "booking-booked": (demo) => booked(demo),
  /** The same booking, canceled from its page. */
  "booking-canceled": (demo) => booked(demo, ({ change, token, code }) => change(token, code, { action: "cancel" })),
  /** The same booking, moved five times: it can't move again. */
  "booking-moved-out": (demo) =>
    booked(demo, async ({ change, managed, token, code }) => {
      for (let i = 0; i < 5; i++) {
        const next = (await managed(token, code)).slots[i]
        if (next) await change(token, code, { action: "reschedule", start: next.start })
      }
    }),
  /** The same booking once its time has come: the core answers that it has started, with no times to move to. */
  "booking-started": (demo) => {
    booked(demo)
    demo.wrap("managedBooking", (managed) => async (token, code) => ({ ...(await managed(token, code)), past: true, slots: [] }))
  },
  /** The intro call with no free time left in its days. */
  "booking-no-times": (demo) => {
    bookingLinks(demo)
    demo.wrap("publicBooking", (page) => async (token) => ({ ...(await page(token)), slots: [] }))
  },
  /** Someone else books the time a visitor picked just before they press BOOK: the core says it was just taken. */
  "booking-just-taken": (demo) => {
    bookingLinks(demo)
    let first = true
    demo.wrap("bookSlot", (book) => async (token, request) => {
      if (first) {
        first = false
        await book(token, { start: request.start, name: "Lena Brandt", email: "lena.brandt@example.com", note: null })
      }
      return book(token, request)
    })
  },
  /** Free times that never arrive: the page's loading state. */
  "booking-loading": (demo) => {
    bookingLinks(demo)
    demo.wrap("publicBooking", () => () => new Promise(() => {}))
    demo.wrap("managedBooking", () => () => new Promise(() => {}))
  },
  /** The desktop app, which has no public address: Booking links says the pages need the gateway. */
  "booking-desktop": ({ flags }) => {
    flags.desktopApp = true
  },
}

/** The demo's two booking links: what they offer, and the address each page keeps (any 32 hex digits). */
const LINKS: { token: string; input: BookingLinkInput }[] = [
  {
    token: "4f1c9a7e2b6d4e8a9c3f5b7d1e2a6c48",
    input: { title: "Intro call", minutes: 30, calendarId: "cal-work", dayStart: 9 * 60, dayEnd: 17 * 60, weekdaysOnly: true, daysAhead: 7, note: "A first talk about the project. On video; I'll send the link." },
  },
  {
    token: "a83d5f0b6c2e4a179d8b3c5e7f9a1d26",
    input: { title: "Portfolio review", minutes: 60, calendarId: "cal-personal", dayStart: 10 * 60, dayEnd: 16 * 60, weekdaysOnly: false, daysAhead: 14, note: null },
  },
]
/** The booking's private code on its change page. */
const CODE = "9b2e7c4a1f6d3e8b5a0c2d4f6e8a1b3c"

type Seeded = { real: Map<string, string>; codes: Map<string, string>; work: Promise<unknown>[] }
const seeded = new WeakMap<Demo["client"], Seeded & { ready: Promise<void> }>()

/**
 * Saves the two links through the demo's own calls, once, and keeps their
 * pages at fixed addresses: what the app shows says the fixed token, and the
 * visitor's calls turn it back into the one the demo made. Every read waits
 * for the seeding, and for a booking a scenario makes, to be done.
 */
function bookingLinks({ client, wrap }: Demo) {
  const had = seeded.get(client)
  if (had) return had
  const save = client.saveBookingLink
  const s: Seeded & { ready: Promise<void> } = { real: new Map(), codes: new Map(), work: [], ready: Promise.resolve() }
  s.ready = (async () => {
    for (const l of LINKS) s.real.set(l.token, (await save(null, l.input)).token)
  })()
  seeded.set(client, s)
  const settled = async () => {
    await s.ready
    await Promise.all(s.work)
  }
  const shown = (token: string) => [...s.real].find(([, r]) => r === token)?.[0] ?? token
  const realOf = async (token: string) => (await settled(), s.real.get(token) ?? token)
  const codeOf = (code: string) => s.codes.get(code) ?? code
  wrap("bookingLinks", (list) => async () => {
    await settled()
    return (await list()).map((l) => ({ ...l, token: shown(l.token) }))
  })
  wrap("saveBookingLink", (put) => async (id, input) => {
    const l = await put(id, input)
    return { ...l, token: shown(l.token) }
  })
  wrap("publicBooking", (page) => async (token) => page(await realOf(token)))
  wrap("bookSlot", (book) => async (token, request) => book(await realOf(token), request))
  wrap("managedBooking", (managed) => async (token, code) => managed(await realOf(token), codeOf(code)))
  wrap("changeBooking", (change) => async (token, code, c) => change(await realOf(token), codeOf(code), c))
  return s
}

type Booking = { token: string; code: string; change: Demo["client"]["changeBooking"]; managed: Demo["client"]["managedBooking"] }

/**
 * The intro call, booked by Rui Costa at its third free time, under the fixed
 * code; then `then`, with the demo's own calls (the real token and code).
 */
function booked(demo: Demo, then?: (b: Booking) => Promise<unknown>) {
  const { bookSlot: book, publicBooking: page, changeBooking: change, managedBooking: managed } = demo.client
  const s = bookingLinks(demo)
  s.work.push(
    (async () => {
      await s.ready
      const token = s.real.get(LINKS[0]!.token)!
      const slot = (await page(token)).slots[2]!
      const b = await book(token, { start: slot.start, name: "Rui Costa", email: "rui.costa@example.com", note: "Looking forward to it." })
      s.codes.set(CODE, b.code)
      await then?.({ token, code: b.code, change, managed })
    })(),
  )
}
/** Gives the first "reminder" listener one reminder for the next event today with a place, 30 minutes before it. */
function dueOnce({ client, wrap }: Demo, leave: boolean) {
  let fired = false
  wrap("on", (on) => (event, handler) => {
    const off = on(event, handler)
    if (event === "reminder" && !fired) {
      fired = true
      const now = Math.floor(Date.now() / 1000)
      void client.listOccurrences(now, now + 86_400).then((list) => {
        const o = list.filter((x) => !x.allDay && x.location && x.start > now).sort((a, b) => a.start - b.start)[0]
        if (!o) return
        const due: DueReminder = { eventId: o.eventId, title: o.title, location: o.location, start: o.start, fireAt: o.start - 30 * 60, leave: leave || undefined }
        setTimeout(() => handler(due), 300)
      })
    }
    return off
  })
}
