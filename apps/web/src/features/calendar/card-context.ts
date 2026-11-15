import type { KeyboardEvent } from "react"

import type { Occurrence } from "@/core/types"
import { eventSwatch, type SwatchId, type SwatchNumber } from "@/lib/swatches"

import { addDays, clock, monthDay, sameDay } from "./dates"
import { occurrenceKey } from "./layout"
import { nextLine } from "./next-up"
import { travelLabel } from "./reminders"

/**
 * What every calendar view needs to draw an event the same way (ADR-0098;
 * brief C1, "Event color and emphasis").
 */
export interface CardContext {
  /** Each calendar's swatch, for a neutral card's bar. */
  swatches: Map<string, SwatchNumber>
  /**
   * The view has a detail column (Upcoming and Day on a desktop): the open
   * event is `selected`, and the next event is a neutral card that says so.
   * Without one (a phone's Day, Week, Month, the time grid) nothing can be
   * selected, and the next event takes the primary look instead. The two never
   * show in one view.
   */
  selecting: boolean
  /** The open event's key, where the view selects. */
  selected: string | null
  /** The event on now, or the next to start (next-up.ts). */
  next: Occurrence | null
  /** Now, in the core's seconds. */
  now: number
  onOpen: (o: Occurrence) => void
}

/** How one event looks in a view: selected, the next one, or neutral in its calendar's swatch. */
export function cardLook(o: Occurrence, ctx: CardContext): { selected: boolean; next: boolean; swatch: SwatchId | undefined; note: string | undefined } {
  const key = occurrenceKey(o)
  const selected = ctx.selecting && ctx.selected === key
  const isNext = !!ctx.next && occurrenceKey(ctx.next) === key
  const primary = selected || (isNext && !ctx.selecting)
  return {
    selected,
    next: isNext && !ctx.selecting,
    // The primary look keeps its own bar: a swatch would make it read as a calendar's.
    swatch: primary ? undefined : eventSwatch(ctx.swatches.get(o.calendarId)),
    note: isNext ? nextLine(o, ctx.now) : undefined,
  }
}

/** The name an event is read by (brief C1): "Dentist, 16:30 to 17:15, 20 min travel before". */
export function spokenEvent(o: Occurrence) {
  const when = o.allDay ? "all day" : `${clock(o.start)} to ${clock(o.end)}`
  return [o.title || "(no title)", when, o.travel && !o.allDay ? `${travelLabel(o.travel)} travel before` : null].filter(Boolean).join(", ")
}

const EVENT = '[data-slot="calendar-event"]'

/**
 * The arrow keys between events in a grid (brief C1): up and down within a
 * day (a `[data-col]`), left and right to the nearest event of the next day
 * that has one. Enter opens, as a button does. Put it on the grid's element.
 */
export function moveBetweenEvents(e: KeyboardEvent<HTMLElement>) {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) || e.metaKey || e.ctrlKey || e.altKey) return
  const from = (e.target as HTMLElement).closest<HTMLElement>(EVENT)
  const col = from?.closest<HTMLElement>("[data-col]")
  if (!from || !col) return
  const cols = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-col]")]
  const events = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(EVENT)]
  let to: HTMLElement | undefined
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    const list = events(col)
    to = list[list.indexOf(from) + (e.key === "ArrowDown" ? 1 : -1)]
  } else {
    const step = e.key === "ArrowRight" ? 1 : -1
    const y = from.getBoundingClientRect().top
    for (let i = cols.indexOf(col) + step; i >= 0 && i < cols.length && !to; i += step) {
      // The event nearest in height: the same time of day, as near as the next day has one.
      to = events(cols[i]!).sort((a, b) => Math.abs(a.getBoundingClientRect().top - y) - Math.abs(b.getBoundingClientRect().top - y))[0]
    }
  }
  if (!to) return
  // The arrows are the grid's here: the calendar's own paging keys (which may be arrows) do not also act on them.
  e.preventDefault()
  e.stopPropagation()
  to.focus()
}

/** All-day first, then by start: the order a day's cards stand in. */
export const dayOrder = (list: Occurrence[]) => [...list].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.title.localeCompare(b.title))

/** A day's heading: "Today // Thursday", "Tomorrow // Friday", "Saturday // 11.14". */
export function dayHeading(d: Date, today: Date) {
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" })
  if (sameDay(d, today)) return `Today // ${weekday}`
  if (sameDay(d, addDays(today, 1))) return `Tomorrow // ${weekday}`
  return `${weekday} // ${monthDay(d)}`
}
