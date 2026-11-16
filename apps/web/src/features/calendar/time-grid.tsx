import { useEffect, useRef, type CSSProperties } from "react"

import { useNow } from "@/hooks/use-now"
import type { Occurrence } from "@/core/types"

import { EventCard, WeekDayHead } from "./agenda"
import { moveBetweenEvents, type CardContext } from "./card-context"
import { DAY, addDays, sameDay, secs } from "./dates"
import { layoutDay, occurrenceKey } from "./layout"
import { travelLabel } from "./reminders"
import { deviceZone, useSecondZone, zoneAbbr, zoneCity } from "./zones"

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad = (n: number) => String(n).padStart(2, "0")
/** An hour in a zone, by the clock as the frames write one: `09:00`, `14:30` for a half-hour zone. */
const zoneClock = (zone: string, at: Date) => new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at)
/** A length in hours of the grid, as CSS: the hour's height is a knob in `styles/calendar.css`. */
const hours = (h: number) => `calc(var(--c-calendar-hour-height) * ${h})`

/**
 * The time grid (ADR-0098; brief C1, Hours on): app-level, drawn from tokens
 * in `styles/calendar.css`, with Vale's compact CalendarEvent for each event.
 *
 * - A day header row as the card week draws it, today on the primary block,
 *   and an ALL DAY row of compact events. `header={false}` leaves the day
 *   header out (a phone's Day, under its week strip).
 * - An hour gutter in the meta role, one hairline an hour, 48 px an hour. A
 *   second time zone (Settings › Calendar) adds its own gutter in label ink,
 *   and the header names both zones.
 * - Events stretched to their length (24 px at least), title first; ones that
 *   overlap stand side by side (layout.ts). Travel before an event is a dashed
 *   box above it. Now is a 2 px primary rule across today, with a square at the gutter.
 * - It opens scrolled to the working day, inside its own scroller: the
 *   column's height with `fill`, else a box of `--c-calendar-grid-height`.
 * - With `onCreateAt`, pressing an empty
 *   hour starts a new event at that hour. The arrow keys move between events.
 */
export function TimeGrid({
  days,
  occurrences,
  ctx,
  onCreateAt,
  header = true,
  loading = false,
  fill = false,
}: {
  days: Date[]
  occurrences: Occurrence[]
  ctx: CardContext
  onCreateAt?: (at: Date) => void
  header?: boolean
  loading?: boolean
  /** Fill the column's height and scroll the hours inside it (a full-width view). Otherwise the hours scroll in a box of their own height, inside a list that scrolls. */
  fill?: boolean
}) {
  const now = useNow()
  const zone = useSecondZone()
  const scroller = useRef<HTMLDivElement>(null)
  // Open on the working day (or just before now), like Apple Calendar.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const hour = Math.max(0, Math.min(new Date().getHours() - 1, 7))
    const px = parseFloat(getComputedStyle(el).getPropertyValue("--c-calendar-hour-height")) * parseFloat(getComputedStyle(document.documentElement).fontSize)
    // A little above the hour, so its label is not cut by the edge.
    el.scrollTop = Math.max(0, hour * (px || 48) - (px || 48) / 4)
  }, [])

  const timed = (d: Date) => occurrences.filter((o) => !o.allDay && o.start < secs(d) + DAY && o.end > secs(d))
  const allDay = (d: Date) => occurrences.filter((o) => o.allDay && o.start < secs(addDays(d, 1)) && o.end > secs(d))
  const anyAllDay = days.some((d) => allDay(d).length > 0)
  const hourAt = (h: number) => {
    const d = new Date(days[0]!)
    d.setHours(h, 0, 0, 0)
    return d
  }
  // The gutters, then one column a day. A second zone's gutter stands first, as before (ADR-0088).
  const cols = { "--time-grid-gutters": zone ? 2 : 1, "--time-grid-days": days.length } as CSSProperties
  const gutterHead = zone ? (
    <>
      <span className="time-grid-zone type-meta" title={zoneCity(zone)}>
        {zoneAbbr(zone, hourAt(12))}
      </span>
      <span className="time-grid-zone type-meta" title={zoneCity(deviceZone())}>
        {zoneAbbr(deviceZone(), hourAt(12))}
      </span>
    </>
  ) : (
    <span />
  )

  return (
    <div className="time-grid" data-slot="time-grid" data-fill={fill ? "" : undefined} data-one-day={days.length === 1 ? "" : undefined} style={cols} aria-busy={loading || undefined}>
      {(header || zone) && (
        <div className="time-grid-row time-grid-head" aria-hidden={!header || undefined}>
          {gutterHead}
          {header && days.map((d) => <WeekDayHead key={d.toDateString()} day={d} today={now} />)}
        </div>
      )}
      {anyAllDay && (
        <div className="time-grid-row time-grid-all-day" role="group" aria-label="All day" onKeyDown={moveBetweenEvents}>
          <span className="time-grid-all-day-label type-meta">All day</span>
          {days.map((d) => (
            <div key={d.toDateString()} className="time-grid-all-day-day" data-col="">
              {allDay(d).map((o) => (
                <EventCard key={occurrenceKey(o)} o={o} ctx={ctx} compact />
              ))}
            </div>
          ))}
        </div>
      )}
      <div ref={scroller} className="time-grid-scroll">
        <div className="time-grid-row time-grid-body" onKeyDown={moveBetweenEvents}>
          {zone && (
            <div className="time-grid-gutter" data-slot="second-zone" aria-label={`Hours in ${zoneCity(zone)}`}>
              {HOURS.slice(1).map((h) => (
                <span key={h} className="time-grid-hour type-meta" data-zone="" style={{ top: hours(h) }}>
                  {zoneClock(zone, hourAt(h))}
                </span>
              ))}
            </div>
          )}
          <div className="time-grid-gutter" aria-hidden>
            {HOURS.slice(1).map((h) => (
              <span key={h} className="time-grid-hour type-meta" style={{ top: hours(h) }}>
                {pad(h)}:00
              </span>
            ))}
          </div>
          {days.map((d) => {
            const placed = layoutDay(d, timed(d))
            const today = sameDay(d, now)
            return (
              <div
                key={d.toDateString()}
                className="time-grid-day"
                data-col=""
                data-day={d.toDateString()}
                data-create={onCreateAt ? "" : undefined}
                onClick={(e) => {
                  if (!onCreateAt) return
                  // The hour pressed: a new event starts on it.
                  const box = e.currentTarget.getBoundingClientRect()
                  const at = new Date(d)
                  at.setHours(Math.min(23, Math.floor(((e.clientY - box.top) / box.height) * 24)), 0, 0, 0)
                  onCreateAt(at)
                }}
              >
                {HOURS.slice(1).map((h) => (
                  <div key={h} className="time-grid-line" style={{ top: hours(h) }} aria-hidden />
                ))}
                {/* Travel time (ADR-0029): a dashed box above the event, the same width. */}
                {placed
                  .filter((p) => p.o.travel && p.top > 0)
                  .map((p) => {
                    const lead = Math.min(p.o.travel!, p.top)
                    return (
                      <div
                        key={`travel-${occurrenceKey(p.o)}`}
                        aria-hidden
                        data-slot="travel-band"
                        className="time-grid-travel"
                        style={{ top: hours((p.top - lead) / 60), height: hours(lead / 60), left: `${(p.col / p.cols) * 100}%`, width: `${100 / p.cols}%` }}
                      >
                        {/* Words where a line of meta fits: 20 px, 25 minutes. */}
                        {lead >= 25 && <span className="type-meta">{travelLabel(p.o.travel!)} travel</span>}
                      </div>
                    )
                  })}
                {placed.map((p) => (
                  // A press on an event opens it; it never reaches the hour under it.
                  <div
                    key={occurrenceKey(p.o)}
                    className="time-grid-event"
                    style={{ top: hours(p.top / 60), height: hours(p.height / 60), left: `${(p.col / p.cols) * 100}%`, width: `${100 / p.cols}%` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EventCard o={p.o} ctx={ctx} compact />
                  </div>
                ))}
                {today && (
                  <div className="time-grid-now" style={{ top: hours((now.getHours() * 60 + now.getMinutes()) / 60) }} aria-hidden>
                    <span className="time-grid-now-mark" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
