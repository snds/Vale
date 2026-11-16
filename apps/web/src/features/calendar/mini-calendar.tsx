import { useMemo, useState } from "react"

import { IconButton, SectionHeader } from "@unicron/ui"
import { MonthGrid } from "@/components/month-grid"
import { getCoreClient, type AppJump } from "@/core/client"
import { useCoreEvents, useOccurrences } from "@/core/queries"
import type { Occurrence } from "@/core/types"
import { useNowSecs } from "@/hooks/use-now"
import { APP_JUMP_KEY } from "@/lib/app-jump"
import { calendarSwatches, eventSwatch } from "@/lib/swatches"

import { spokenEvent } from "./card-context"
import { addDays, dayLabel, fmt, fromSecs, secs, startOfDay, startOfWeek } from "./dates"
import { JoinButton } from "./join-button"
import { occurrenceKey } from "./layout"
import { AHEAD, nextUp, whenLabel } from "./next-up"
import { OccurrenceCard } from "./occurrence-card"
import { QuickAdd } from "./quick-add-field"
import { useCalendars } from "./use-calendars"

/**
 * The menu-bar calendar (ADR-0054, ADR-0100; brief C8): what is next, a
 * month to pick a day from, that day's events, and quick add, without Vale
 * open. The desktop's small window under the tray icon; `/?mini` in a
 * browser shows the same. 320 px wide, no shell, the ground and one hairline
 * frame (styles/calendar.css, `.mini-calendar`).
 *
 * - Today's date, and "Open Vale".
 * - NEXT UP: one card in the next look, `Now` or `In 25 min`, and JOIN, the
 *   window's one primary, when it has a call.
 * - The compact month grid, a square under busy days; pressing a day picks it.
 * - The picked day (TODAY, TOMORROW or its date): its events as compact
 *   cards, each with a secondary JOIN while its call has not ended.
 * - Quick add: Enter adds the event, and its day shows, so it appears.
 */
export function MiniCalendar() {
  useCoreEvents()
  const calendars = useCalendars()
  const swatches = useMemo(() => calendarSwatches(calendars.values()), [calendars])
  const now = useNowSecs(30_000)
  const today = startOfDay(fromSecs(now))
  // The window stays open for days: a new day starts back at today.
  const todayKey = today.getTime()
  const [chosen, setChosen] = useState({ on: todayKey, picked: today, month: today })
  const { picked, month } = chosen.on === todayKey ? chosen : { picked: today, month: today }
  const setPicked = (d: Date) => setChosen({ on: todayKey, picked: startOfDay(d), month: d })
  const setMonth = (d: Date) => setChosen({ on: todayKey, picked, month: d })

  const { data: soon = [] } = useOccurrences(now - AHEAD, now + AHEAD)
  const { data: dayAll = [] } = useOccurrences(secs(picked), secs(addDays(picked, 1)))
  const gridStart = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1))
  const { data: monthOcc = [] } = useOccurrences(secs(gridStart), secs(addDays(gridStart, 42)))
  // Events per day, for the month's marks and the days' names.
  const busyDays = useMemo(() => {
    const count = new Map<number, number>()
    for (const day of monthOcc.flatMap((o) => daysOf(o))) count.set(day, (count.get(day) ?? 0) + 1)
    return count
  }, [monthOcc])
  const next = nextUp(soon, now)
  // NEXT UP's event stands above; the day list leaves it out, so a small window never shows it twice (Vale 52).
  const dayOcc = next ? dayAll.filter((o) => occurrenceKey(o) !== occurrenceKey(next)) : dayAll

  // The desktop brings its main window forward; a browser (the gateway) has
  // only this one, so it opens the app page in its place.
  const open = async (jump: AppJump | null) => {
    try {
      await (await getCoreClient()).showApp(jump)
    } catch {
      try {
        if (jump) sessionStorage.setItem(APP_JUMP_KEY, JSON.stringify(jump))
      } catch {
        // No storage: the app opens without the jump.
      }
      location.assign("/")
    }
  }
  const openEvent = (o: Occurrence) => void open({ kind: "event", id: o.eventId, start: o.start })
  const label = dayLabel(picked, today)
  const when = (o: Occurrence) => {
    const w = whenLabel(o, now)
    return w.charAt(0).toUpperCase() + w.slice(1)
  }

  return (
    <div className="mini-calendar" data-slot="mini-calendar">
      <header className="flex items-center justify-between gap-2">
        <h1 className="type-subtitle">{today.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</h1>
        <IconButton label="Open Vale" icon="launch" onClick={() => void open(null)} />
      </header>

      <section aria-label="Next up" className="flex flex-col gap-3">
        <SectionHeader title="Next up" />
        {next ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <OccurrenceCard occurrence={next} next note={when(next)} label={`${spokenEvent(next)}, ${when(next)}`} onOpen={() => openEvent(next)} />
            </div>
            {next.meetingUrl && <JoinButton url={next.meetingUrl} appUrl={next.meetingAppUrl} />}
          </div>
        ) : (
          <p className="type-body text-text-secondary">Nothing else in the next 12 hours.</p>
        )}
      </section>

      <MonthGrid variant="compact" month={month} onMonthChange={setMonth} selected={picked} onPick={setPicked} marks={(d) => ({ events: busyDays.get(startOfDay(d).getTime()) ?? 0 })} />

      <section aria-label={label} className="mini-calendar-day flex flex-col gap-3">
        <SectionHeader title={label === "Today" || label === "Tomorrow" ? label : fmt.dayLong(picked)} count={dayOcc.length || undefined} />
        {dayOcc.length === 0 ? (
          <p className="type-body text-text-secondary">Nothing planned</p>
        ) : (
          <ul aria-label={`Events, ${label}`} className="flex flex-col gap-2">
            {dayOcc.map((o) => (
              <li key={occurrenceKey(o)} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <OccurrenceCard occurrence={o} compact swatch={eventSwatch(swatches.get(o.calendarId))} label={spokenEvent(o)} onOpen={() => openEvent(o)} />
                </div>
                {o.meetingUrl && o.end > now && <JoinButton url={o.meetingUrl} appUrl={o.meetingAppUrl} variant="outline" />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <QuickAdd calendars={calendars} onAdded={(start) => setPicked(fromSecs(start))} />
    </div>
  )
}

/** The local midnights an occurrence touches, for the month's marks. */
function daysOf(o: Occurrence): number[] {
  const out: number[] = []
  const end = o.end > o.start ? o.end - 1 : o.start
  for (let d = startOfDay(fromSecs(o.start)); secs(d) <= end && out.length < 42; d = addDays(d, 1)) out.push(d.getTime())
  return out
}
