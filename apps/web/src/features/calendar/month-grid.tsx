import { Button, SectionHeader, useAppFrame } from "@unicron/ui"
import { MonthGrid as MonthPicker } from "@/components/month-grid"
import type { Occurrence } from "@/core/types"
import type { SwatchNumber } from "@/lib/swatches"

import { CardSkeletons, EventCard, NothingPlanned } from "./agenda"
import { dayHeading, dayOrder, moveBetweenEvents, type CardContext } from "./card-context"
import { addDays, eventsOn, fmt, sameDay, startOfDay, startOfWeek } from "./dates"
import { occurrenceKey } from "./layout"

/** Events a day cell lists before "+2 more"; the rest are a press away in the Day. */
const PER_DAY = 3

interface MonthProps {
  /** The day in focus: its month shows, and on a phone it is the picked day. */
  month: Date
  occurrences: Occurrence[]
  ctx: CardContext
  /** Opens a day in the Day view. */
  onDay: (d: Date) => void
  /** Picks a day without leaving the month (the phone's Month). */
  onPickDay: (d: Date) => void
  loading: boolean
}

/**
 * Six weeks around a month (ADR-0098; brief C1). On a desktop each day lists
 * up to three compact events, then "+2 more", which opens that day. On a
 * phone, the shared month grid (ADR-0088) with up to three swatch squares a
 * day; pressing a day picks it and lists its events under the grid.
 */
export function MonthGrid(props: MonthProps) {
  return useAppFrame().phone ? <PhoneMonth {...props} /> : <DesktopMonth {...props} />
}

function PhoneMonth({ month, occurrences, ctx, onPickDay, loading }: MonthProps) {
  const list = dayOrder(eventsOn(occurrences, month))
  const title = dayHeading(month, startOfDay(new Date(ctx.now * 1000)))
  return (
    <div className="flex flex-col gap-8" data-slot="month-grid">
      <MonthPicker
        variant="month"
        paging={false}
        month={month}
        // The page head pages the month; a key that leaves it moves the picked day with it.
        onMonthChange={onPickDay}
        selected={month}
        onPick={onPickDay}
        marks={(d) => {
          const on = eventsOn(occurrences, d)
          // One square a calendar, in the order of the day; an event of a calendar with no color adds none.
          const seen = [...new Set(on.map((o) => ctx.swatches.get(o.calendarId)).filter((s): s is SwatchNumber => !!s))]
          return { events: on.length, swatches: seen }
        }}
      />
      <section className="flex flex-col gap-4" aria-label={title.replace(" // ", ", ")} aria-busy={loading || undefined}>
        <SectionHeader title={title} count={loading ? undefined : list.length} />
        {loading ? (
          <CardSkeletons />
        ) : (
          <div className="flex flex-col gap-2">
            {list.length === 0 && <NothingPlanned />}
            {list.map((o) => (
              <EventCard key={occurrenceKey(o)} o={o} ctx={ctx} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function DesktopMonth({ month, occurrences, ctx, onDay, loading }: MonthProps) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = startOfWeek(first)
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
  const today = startOfDay(new Date(ctx.now * 1000))

  return (
    <div className="month-cells" role="grid" aria-label={fmt.monthYear(first)} aria-busy={loading || undefined} data-slot="month-cells" onKeyDown={moveBetweenEvents}>
      <div role="row" className="month-cells-week month-cells-head">
        {weeks[0]!.map((d) => (
          <span key={d.getDay()} role="columnheader" aria-label={d.toLocaleDateString(undefined, { weekday: "long" })} className="type-overline">
            {d.toLocaleDateString(undefined, { weekday: "short" })}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]!.toDateString()} role="row" className="month-cells-week">
          {week.map((d) => {
            const list = loading ? [] : dayOrder(eventsOn(occurrences, d))
            const isToday = sameDay(d, today)
            return (
              <div
                key={d.toDateString()}
                role="gridcell"
                aria-label={[fmt.dayLong(d), isToday ? "today" : null, list.length ? `${list.length} ${list.length === 1 ? "event" : "events"}` : null].filter(Boolean).join(", ")}
                aria-current={isToday ? "date" : undefined}
                className="month-cell"
                data-outside={d.getMonth() !== first.getMonth() ? "" : undefined}
                data-col=""
              >
                <span className="month-cell-date type-meta" data-today={isToday ? "" : undefined} aria-hidden>
                  {String(d.getDate()).padStart(2, "0")}
                </span>
                {list.slice(0, PER_DAY).map((o) => (
                  <EventCard key={occurrenceKey(o)} o={o} ctx={ctx} compact />
                ))}
                {list.length > PER_DAY && (
                  <div>
                    <Button variant="ghost" size="xs" onClick={() => onDay(d)} aria-label={`${list.length - PER_DAY} more on ${fmt.dayLong(d)}`}>
                      +{list.length - PER_DAY} more
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
