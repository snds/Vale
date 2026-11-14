import type { ReactNode } from "react"

import { CalendarEvent, Highlight, type CalendarEventProps } from "@unicron/ui"
import type { Occurrence } from "@/core/types"

import { clock, folio, fromSecs } from "./dates"

/**
 * When an occurrence is, as the frames write it: `16:30 – 17:15`, or "All day"; with `date`, the day
 * first. Compact, the start alone after the title, and nothing for an all-day event, so the title keeps the room.
 */
function occurrenceTime(o: Pick<Occurrence, "start" | "end" | "allDay">, date = false, compact = false) {
  if (compact) return o.allDay ? "" : clock(o.start)
  const hours = o.allDay ? "All day" : `${clock(o.start)} – ${clock(o.end)}`
  return date ? `${folio(fromSecs(o.start))} // ${hours}` : hours
}

export interface OccurrenceCardProps {
  occurrence: Occurrence
  onOpen: () => void
  /** The event open beside the list. */
  selected?: boolean
  /** Say the day before the hours, where the list is not already under a day (search results). */
  date?: boolean
  /** The calendar's swatch (`calendarSwatches`), for the bar. */
  swatch?: CalendarEventProps["swatch"]
  /** The next event: the primary tone. */
  next?: boolean
  /** One line, title first, then the start: for the time grid or a month cell. */
  compact?: boolean
  /** The words a search matched: marked in the title and the place. */
  query?: string
  /** A line in the place's slot instead of the place: "Next // in 1 h 18 min" (brief C1). */
  note?: ReactNode
  /** The name it is read by, where its text alone says less than the views need ("Dentist, 16:30 to 17:15, 20 min travel before"). */
  label?: string
}

/**
 * An occurrence as a card (ADR-0085): the core's `Occurrence` on unicron's
 * calendar event. Search lists with it; the calendar's views use it with the
 * optional props they need (ADR-0098).
 */
export function OccurrenceCard({ occurrence: o, onOpen, selected, date, swatch, next, compact, query, note, label }: OccurrenceCardProps) {
  const title = o.title || "(no title)"
  const place = o.location ? (query ? <Highlight text={o.location} query={query} /> : o.location) : undefined
  return (
    <CalendarEvent
      tone={next ? "primary" : "neutral"}
      selected={selected}
      swatch={swatch}
      compact={compact}
      time={occurrenceTime(o, date, compact)}
      title={query ? <Highlight text={title} query={query} /> : title}
      place={note ?? place}
      aria-label={label}
      onClick={onOpen}
    />
  )
}
