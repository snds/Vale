import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva } from "class-variance-authority"
import { swatchFillClasses, type SwatchId } from "@unicron/ui"

import { cn } from "@/lib/utils"

/**
 * One event in a day, a week or a list: a 2px bar, its time, title and place (Figma's Calendar
 * Event, 32:116). Unicron 1.1 took it out of the core, since only Vale has a calendar (Unicron 2);
 * this is Unicron 1.0's part, moved here as its migration guide says (docs/08 → CalendarEvent).
 */

/** `primary`: the event that matters now (the next one). `neutral`: every other. */
export type CalendarEventTone = "primary" | "neutral"

const event = cva(
  // The bar sits inside the top and bottom padding, as drawn: it stops 8px short of both ends.
  // No left padding: the bar is the left edge. No radius. The hover and press washes are laid
  // over the fill, so it stays opaque.
  "group/calendar-event relative flex w-full min-w-0 items-stretch text-left select-none after:pointer-events-none after:absolute after:inset-0 hover:after:bg-state-hover active:after:bg-state-pressed disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      look: {
        primary: "bg-primary-soft",
        neutral: "bg-surface-raised",
      },
      compact: {
        // As drawn: 8 top and bottom, 12 right, 12 between the bar and the text.
        false: "gap-3 py-2 pr-3",
        // In a week strip, a time grid or a month cell: one line, title first. 24 tall, so on a
        // coarse pointer its target widens to 44 (`hit-area`; the washes use ::after).
        true: "hit-area gap-2 py-0.5 pr-2",
      },
    },
    defaultVariants: { look: "neutral", compact: false },
  }
)

const BAR: Record<CalendarEventTone, string> = {
  primary: "bg-primary-fill",
  neutral: "bg-line-rule",
}

export type CalendarEventProps = Omit<useRender.ComponentProps<"button">, "children" | "title" | "className"> & {
  /** Default `neutral`. */
  tone?: CalendarEventTone
  /** When, in the meta role ("16:30 – 17:15", "All day", "WED 11.18 // 16:30 – 17:15"). */
  time: React.ReactNode
  /** What, in ui/emphasis ("Dentist"). */
  title: React.ReactNode
  /** Where, or the next step, in the caption role. Not shown when compact. */
  place?: React.ReactNode
  /** The bar in the calendar's swatch instead of the tone's colour. The fill stays the tone's. */
  swatch?: SwatchId
  /** One line, title first, then time: for a week strip, a time grid or a month cell. */
  compact?: boolean
  /** The event open in the detail beside the list: the primary look and `aria-current`. */
  selected?: boolean
  /** A small mark at the end of the first line. */
  mark?: React.ReactNode
  /** Makes the event a link. Without it, it is a button. */
  href?: string
}

/**
 * A button (or a link with `href`, or anything with `render`), named by its text in reading order:
 * "16:30 – 17:15 Dentist Sierra Dental, Roseville".
 */
export function CalendarEvent({
  tone = "neutral",
  time,
  title,
  place,
  swatch,
  compact = false,
  selected = false,
  mark,
  href,
  render,
  ...props
}: CalendarEventProps) {
  const look: CalendarEventTone = selected ? "primary" : tone
  const bar = swatch ? swatchFillClasses[swatch] : BAR[look]
  const markNode = mark ? (
    <span data-slot="calendar-event-mark" className="ml-auto inline-flex shrink-0 items-center self-center">
      {mark}
    </span>
  ) : null

  // The spaces between the parts are not drawn (they sit between flex items); they keep the words
  // apart in the event's name.
  const content = (
    <>
      <span aria-hidden="true" data-slot="calendar-event-bar" className={cn("w-0.5 shrink-0 self-stretch", bar)} />
      {compact ? (
        // Two sizes share a baseline here, which makes the line box a pixel taller than 20; the
        // line is held to 20 so the event stays 24 tall, on the grid.
        <span data-slot="calendar-event-text" className="flex h-5 min-w-0 flex-1 items-baseline gap-2">
          <span data-slot="calendar-event-title" className="type-ui-emphasis text-foreground min-w-0 truncate">
            {title}
          </span>{" "}
          <span data-slot="calendar-event-time" className="type-meta text-muted-foreground shrink-0">
            {time}
          </span>
          {markNode}
        </span>
      ) : (
        <span data-slot="calendar-event-text" className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span data-slot="calendar-event-time" className="type-meta text-muted-foreground min-w-0">
              {time}
            </span>
            {markNode}
          </span>{" "}
          <span data-slot="calendar-event-title" className="type-ui-emphasis text-foreground">
            {title}
          </span>{" "}
          {place ? (
            <span data-slot="calendar-event-place" className="type-caption text-support-foreground">
              {place}
            </span>
          ) : null}
        </span>
      )}
    </>
  )

  return useRender({
    defaultTagName: href ? "a" : "button",
    render,
    props: mergeProps<"button">(
      {
        ...(href ? { href } : render ? null : { type: "button" }),
        "aria-current": selected ? "true" : undefined,
        className: event({ look, compact }),
        children: content,
      },
      props
    ),
    state: { slot: "calendar-event", tone: look, selected, compact },
  })
}
