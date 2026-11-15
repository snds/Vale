import { useRef, type KeyboardEvent } from "react"

import { addDays, fmt, sameDay } from "./dates"

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * The week strip (ADR-0098; brief C1, Mobile / 08): seven cells of a mono
 * weekday over the date. The picked day is the primary block; today, while
 * another day is picked, keeps its ink and takes the 2 px edge under it.
 *
 * App-level (contract 5.1a): plain cells drawn from tokens in
 * `styles/calendar.css`. It is a radio group, as a choice of one day is: one
 * cell in the tab order, the arrow keys move the pick a day (and on into the
 * next week), Home and End go to the week's ends. A press picks.
 */
export function WeekStrip({ start, picked, today, onPick, count }: { start: Date; picked: Date; today: Date; onPick: (day: Date) => void; count?: (day: Date) => number }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const cells = useRef<HTMLDivElement>(null)
  const move = (day: Date) => {
    onPick(day)
    // Focus follows the pick, into the next week's strip when it leaves this one.
    requestAnimationFrame(() => cells.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const to: Record<string, () => Date> = {
      ArrowLeft: () => addDays(picked, -1),
      ArrowUp: () => addDays(picked, -1),
      ArrowRight: () => addDays(picked, 1),
      ArrowDown: () => addDays(picked, 1),
      Home: () => days[0]!,
      End: () => days[6]!,
    }
    if (!to[e.key]) return
    e.preventDefault()
    move(to[e.key]!())
  }
  return (
    <div ref={cells} role="radiogroup" aria-label={`Week of ${fmt.dayLong(days[0]!)}`} className="week-strip" onKeyDown={onKeyDown} data-slot="week-strip">
      {days.map((d) => {
        const isPicked = sameDay(d, picked)
        const isToday = sameDay(d, today)
        const n = count?.(d) ?? 0
        return (
          <div
            key={d.toDateString()}
            role="radio"
            aria-checked={isPicked}
            aria-current={isToday ? "date" : undefined}
            aria-label={[fmt.dayLong(d), isToday ? "today" : null, n ? `${n} ${n === 1 ? "event" : "events"}` : null].filter(Boolean).join(", ")}
            tabIndex={isPicked ? 0 : -1}
            data-block={isPicked ? "" : undefined}
            data-today={isToday ? "" : undefined}
            className="week-strip-day"
            onClick={() => onPick(d)}
          >
            <span className="type-overline" aria-hidden>
              {d.toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
            <span className="type-subtitle" aria-hidden>
              {pad(d.getDate())}
            </span>
          </div>
        )
      })}
    </div>
  )
}
