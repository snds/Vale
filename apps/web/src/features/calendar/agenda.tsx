import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { Button, SectionHeader, Skeleton } from "@unicron/ui"
import type { Occurrence } from "@/core/types"

import { cardLook, dayHeading, dayOrder, spokenEvent, type CardContext } from "./card-context"
import { addDays, eventsOn, fmt, sameDay } from "./dates"
import { occurrenceKey } from "./layout"
import { placeLabel } from "./meeting"
import { OccurrenceCard } from "./occurrence-card"

// The card views (ADR-0098; brief C1): Upcoming, the Day's lists, and the
// Week as cards, on unicron's CalendarEvent through OccurrenceCard. The time
// grid is time-grid.tsx; the Month is month-grid.tsx.

/** One event as a card, in the look its view gives it (card-context.ts). */
export function EventCard({ o, ctx, date, compact }: { o: Occurrence; ctx: CardContext; date?: boolean; compact?: boolean }) {
  const look = cardLook(o, ctx)
  return (
    <OccurrenceCard
      occurrence={o}
      onOpen={() => ctx.onOpen(o)}
      selected={look.selected}
      next={look.next}
      swatch={look.swatch}
      // A bare meeting link reads as its service ("Google Meet"), not a long address.
      note={compact ? undefined : (look.note ?? placeLabel(o) ?? undefined)}
      date={date}
      compact={compact}
      label={spokenEvent(o)}
    />
  )
}

/** Three cards' worth of loading, for one day (brief C1, States). */
export function CardSkeletons({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className={compact ? "grid h-6" : "grid h-20"}>
          <Skeleton />
        </div>
      ))}
    </div>
  )
}

/** "Nothing planned", under a day with no events. */
export function NothingPlanned() {
  return <p className="type-caption text-text-secondary">Nothing planned</p>
}

/** A list of cards under one section header. */
function CardSection({ title, count, loading, children, empty, after }: { title: string; count?: number; loading: boolean; children: ReactNode; empty: boolean; after?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-label={title.replace(" // ", ", ")} aria-busy={loading || undefined}>
      <SectionHeader title={title} count={loading ? undefined : count} />
      {loading ? (
        <CardSkeletons />
      ) : (
        <div className="flex flex-col gap-2">
          {empty ? <NothingPlanned /> : children}
          {after}
        </div>
      )}
    </section>
  )
}

/**
 * The Day as cards (Mobile / 08; Desktop: the list column): the picked day's
 * events, then COMING UP, the next `ahead` days after it, with MORE.
 */
export function DayCards({ day, today, occurrences, coming, ctx, loading, onMore }: { day: Date; today: Date; occurrences: Occurrence[]; coming: Occurrence[]; ctx: CardContext; loading: boolean; onMore: () => void }) {
  const list = dayOrder(eventsOn(occurrences, day))
  // What is on the picked day already stands above; an event that runs on past it is not listed twice.
  const ahead = dayOrder(coming).filter((o) => o.start >= +addDays(day, 1) / 1000)
  return (
    <div className="flex flex-col gap-6">
      <CardSection title={dayHeading(day, today)} count={list.length} loading={loading} empty={list.length === 0}>
        {list.map((o) => (
          <EventCard key={occurrenceKey(o)} o={o} ctx={ctx} />
        ))}
      </CardSection>
      <CardSection
        title="Coming up"
        count={ahead.length}
        loading={loading}
        empty={ahead.length === 0}
        after={
          <div>
            <Button variant="link" size="inline" onClick={onMore}>
              More
            </Button>
          </div>
        }
      >
        {ahead.map((o) => (
          <EventCard key={occurrenceKey(o)} o={o} ctx={ctx} date />
        ))}
      </CardSection>
    </div>
  )
}

/**
 * Upcoming (Desktop / 07's list): from today for `days` days, grouped by day,
 * the date in each card's mono line. Today always shows, with "Nothing
 * planned" when it is free, so you know where you are. MORE adds 30 days.
 */
export function Upcoming({ from, days, occurrences, ctx, loading, onMore }: { from: Date; days: number; occurrences: Occurrence[]; ctx: CardContext; loading: boolean; onMore: () => void }) {
  const groups = Array.from({ length: days }, (_, i) => addDays(from, i))
    .map((d) => ({ day: d, items: dayOrder(eventsOn(occurrences, d)) }))
    .filter(({ items }, i) => items.length > 0 || i === 0)
  return (
    <div className="flex flex-col gap-6" data-slot="upcoming">
      {(loading ? groups.slice(0, 1) : groups).map(({ day, items }) => (
        <CardSection key={day.toDateString()} title={dayHeading(day, from)} count={items.length} loading={loading} empty={items.length === 0}>
          {items.map((o) => (
            <EventCard key={occurrenceKey(o)} o={o} ctx={ctx} date />
          ))}
        </CardSection>
      ))}
      {!loading && (
        <div>
          <Button variant="link" size="inline" onClick={onMore}>
            More
          </Button>
        </div>
      )}
    </div>
  )
}

/** A day's head in the card week (Desktop / 06): a mono weekday over the date; today is the primary block. */
export function WeekDayHead({ day, today }: { day: Date; today: Date }) {
  const isToday = sameDay(day, today)
  return (
    <h3 className="week-day-head" data-today={isToday ? "" : undefined} aria-label={`${fmt.dayLong(day)}${isToday ? ", today" : ""}`}>
      <span className="type-overline" aria-hidden>
        {day.toLocaleDateString(undefined, { weekday: "short" })}
      </span>
      <span className="type-number-index" aria-hidden>
        {String(day.getDate()).padStart(2, "0")}
      </span>
    </h3>
  )
}

/** The least content width that keeps seven card columns (brief C1, medium width): 720. */
const SEVEN_COLUMNS = 720

/**
 * The Week as cards (Desktop / 06): seven day columns, each its events
 * stacked in time order, all-day first, "Nothing planned" under a free day.
 * Narrower than 720 px of content the days stand as sections, as on a phone
 * (brief C1, medium width).
 */
export function WeekCards({ days, today, occurrences, ctx, loading, onKeyDown }: { days: Date[]; today: Date; occurrences: Occurrence[]; ctx: CardContext; loading: boolean; onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [stacked, setStacked] = useState(false)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setStacked(el.clientWidth < SEVEN_COLUMNS)
    measure()
    if (typeof ResizeObserver !== "function") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} data-slot="week-cards" data-stacked={stacked ? "" : undefined} onKeyDown={onKeyDown} aria-busy={loading || undefined}>
      {stacked ? (
        <PhoneWeek days={days} today={today} occurrences={occurrences} ctx={ctx} loading={loading} />
      ) : (
        <div className="week-cards-days">
          {days.map((d) => {
            const list = dayOrder(eventsOn(occurrences, d))
            return (
              <section key={d.toDateString()} className="week-cards-day" aria-label={fmt.dayLong(d)} data-col="">
                <WeekDayHead day={d} today={today} />
                <div className="flex flex-col gap-2">
                  {loading ? <CardSkeletons /> : list.length === 0 ? <NothingPlanned /> : list.map((o) => <EventCard key={occurrenceKey(o)} o={o} ctx={ctx} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** The Week on a phone (brief C1): the seven days as sections down the screen, "Thu 12 // Today", then cards. */
export function PhoneWeek({ days, today, occurrences, ctx, loading }: { days: Date[]; today: Date; occurrences: Occurrence[]; ctx: CardContext; loading: boolean }) {
  return (
    <div className="flex flex-col gap-6" data-slot="week-sections">
      {days.map((d) => {
        const list = dayOrder(eventsOn(occurrences, d))
        const name = `${d.toLocaleDateString(undefined, { weekday: "short" })} ${String(d.getDate()).padStart(2, "0")}`
        return (
          <CardSection key={d.toDateString()} title={sameDay(d, today) ? `${name} // Today` : name} count={list.length} loading={loading} empty={list.length === 0}>
            {list.map((o) => (
              <EventCard key={occurrenceKey(o)} o={o} ctx={ctx} />
            ))}
          </CardSection>
        )
      })}
    </div>
  )
}
