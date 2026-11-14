import { useEffect, useMemo, useState, type ReactNode } from "react"

import { useSectionSwitcher } from "@/app/places"
import { useSectionBanner, type SectionBanner } from "@/app/section-banner"
import { SectionNotice } from "@/app/section-notice"
import { SectionSwitcher } from "@/app/section-switcher"
import { pendingJump, useUi } from "@/app/ui-store"
import { vertical } from "@/app/verticals"
import {
  AdaptivePopover,
  AppFrameColumn,
  AppFrameInset,
  Button,
  EmptyState,
  FilterChip,
  FilterChipGroup,
  IconButton,
  Toggle,
  useAppFrame,
} from "@unicron/ui"
import { DemoBar } from "@/app/demo-bar"
import { useRefresh, useScreenFact, useScreenPlace, useScreenRoot } from "@/app/screen"
import { MonthGrid as MonthPicker } from "@/components/month-grid"
import { MasterDetail } from "@/components/master-detail"
import { ScreenHead } from "@/components/page"
import { useAccounts, useCollections, useKeyBindings, useOccurrences } from "@/core/queries"
import type { Occurrence } from "@/core/types"
import { useNowSecs } from "@/hooks/use-now"
import { ariaKey, commandFor } from "@/lib/keys"
import { calendarSwatches } from "@/lib/swatches"

import { DayCards, PhoneWeek, Upcoming, WeekCards } from "./agenda"
import { moveBetweenEvents, type CardContext } from "./card-context"
import { CalendarNav } from "./calendar-nav"
import { SaveSetLayer } from "./calendar-sets"
import { addDays, addMonths, dateInput, eventsOn, folio, fromSecs, monthDay, rangeFact, sameDay, secs, startOfDay, startOfWeek, timeInput, weekNumber } from "./dates"
import { EventDetailPane, EventReview } from "./event-detail"
import { useCalendars } from "./use-calendars"
import { MonthGrid } from "./month-grid"
import { BookingLinks } from "./booking-links"
import { AddCalendarsDialog } from "./interesting"
import { TaskPlanPane, TasksPanel } from "./tasks"
import { tasksOverline, useOpenTasks, usePlanning } from "./planning"
import { nextUp } from "./next-up"
import { occurrenceKey } from "./layout"
import { TimeGrid } from "./time-grid"
import { WeekStrip } from "./week-strip"
import { setCalendarHours, setCalendarRange, useCalendarViewPrefs, type CalendarRange } from "./view-prefs"

type View = CalendarRange

interface Selected {
  eventId: string
  start: number
}

/** The ranges as their chips name them (brief C1): the code's `agenda` is Upcoming. */
const RANGE_NAME: Record<View, string> = { agenda: "Upcoming", day: "Day", week: "Week", month: "Month" }
const STEP_NAME: Record<View, string> = { agenda: "days", day: "day", week: "week", month: "month" }

/** The four ranges as chips (brief C1): UPCOMING · DAY · WEEK · MONTH; a phone has no Upcoming, which is the lower half of its Day. */
function RangeChips({ view, phone, onChange, keys }: { view: View; phone: boolean; onChange: (v: View) => void; keys: Record<string, string> | undefined }) {
  const ranges: View[] = phone ? ["day", "week", "month"] : ["agenda", "day", "week", "month"]
  const defaults: Record<View, string> = { agenda: "a", day: "d", week: "w", month: "m" }
  return (
    <FilterChipGroup type="single" label="View" value={view} onValueChange={(v) => onChange(v as View)}>
      {ranges.map((r) => (
        <FilterChip key={r} value={r} aria-keyshortcuts={ariaKey(keys?.[`calendar.${r}`] ?? defaults[r])}>
          {RANGE_NAME[r]}
        </FilterChip>
      ))}
    </FilterChipGroup>
  )
}

/** "Go to date" (brief C1): the shared month grid in a popover, a square on each day with events. */
function GoToDate({ value, onPick }: { value: Date; onPick: (d: Date) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <AdaptivePopover open={open} onOpenChange={setOpen} title="Go to date" align="end" trigger={<IconButton label="Go to date" icon="calendar" size="icon-sm" />}>
      <GoToDateBody
        value={value}
        onPick={(d) => {
          setOpen(false)
          onPick(d)
        }}
      />
    </AdaptivePopover>
  )
}

// Mounted while the popover is open: it opens on the day in view, and reads that month's events then.
function GoToDateBody({ value, onPick }: { value: Date; onPick: (d: Date) => void }) {
  const [month, setMonth] = useState(value)
  const start = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1))
  const { data = [] } = useOccurrences(secs(start), secs(addDays(start, 42)))
  return <MonthPicker month={month} onMonthChange={setMonth} selected={value} onPick={onPick} marks={(d) => ({ events: eventsOn(data, d).length })} />
}

/** The way back to today, and the steps of the range: TODAY (only while today is out of view), previous, next. */
function PagingSteps({ view, todayInView, onToday, onStep, keys }: { view: View; todayInView: boolean; onToday: () => void; onStep: (n: number) => void; keys: Record<string, string> | undefined }) {
  return (
    <>
      {!todayInView && (
        <Button variant="secondary" size="sm" onClick={onToday} aria-keyshortcuts={ariaKey(keys?.["calendar.today"] ?? "t")}>
          Today
        </Button>
      )}
      <IconButton label={`Previous ${STEP_NAME[view]}`} icon="chevron--left" size="icon-sm" onClick={() => onStep(-1)} />
      <IconButton label={`Next ${STEP_NAME[view]}`} icon="chevron--right" size="icon-sm" onClick={() => onStep(1)} />
    </>
  )
}

/**
 * The calendar (ADR-0098; brief C1, Mobile / 08, Desktop / 06 and the list
 * of Desktop / 07). Four ranges, Upcoming, Day, Week and Month, as cards;
 * one switch, Hours, turns the Day and the Week into the time grid.
 *
 * Expanded: Upcoming and the Day's cards stand in the list column, the open
 * event beside them. The Week, the Month and the Day's hours take the full
 * width; an event opens over the right of it. Medium and phone: one column,
 * and every event opens as a pushed screen.
 */
export function CalendarView() {
  const frame = useAppFrame()
  const phone = frame.phone
  const prefs = useCalendarViewPrefs()
  // A phone has no Upcoming: its Day carries what is coming (brief C1).
  const view: View = phone && prefs.range === "agenda" ? "day" : prefs.range
  // Hours apply to the Day and the Week, and on a phone to the Day only: seven hour columns at 390 are too narrow to read.
  const hours = prefs.hours && (view === "day" || (view === "week" && !phone))
  const setView = (v: View) => {
    setCalendarRange(v)
    setPlace("calendar")
  }
  // Calendar's place (ADR-0084): the calendar itself, or one of its two tools.
  const place = useUi((s) => s.calendarPlace)
  const setPlace = useUi((s) => s.setCalendarPlace)
  // Opened from a note's link: show that event, on its day.
  const [jumped] = useState(() => pendingJump("event"))
  useEffect(() => void useUi.getState().takeJump("event"), [])
  const nowSecs = useNowSecs()
  const today = startOfDay(fromSecs(nowSecs))
  const [focus, setFocus] = useState(() => startOfDay(jumped?.start ? fromSecs(jumped.start) : new Date()))
  const [upcomingDays, setUpcomingDays] = useState(30)
  const [comingDays, setComingDays] = useState(30)
  const [selected, setSelected] = useState<Selected | null>(jumped?.start != null ? { eventId: jumped.id, start: jumped.start } : null)
  const openEditor = useUi((s) => s.openEventEditor)
  const calendars = useCalendars()
  const { isPending: calendarsPending } = useCollections("calendar")
  const { data: accounts = [] } = useAccounts()
  const { data: keys } = useKeyBindings()
  const { data: openTasks = [] } = useOpenTasks()
  // Planning a task takes the detail column (TasksPanel's onPlan closes an event open there).
  const planning = usePlanning((s) => s.task)

  const weekStart = startOfWeek(focus)
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const monthFirst = new Date(focus.getFullYear(), focus.getMonth(), 1)
  const monthStart = startOfWeek(monthFirst)
  // What to read: the range in view, and for the Day its week strip and what is coming after it.
  const [from, to] =
    view === "agenda"
      ? [today, addDays(today, upcomingDays)]
      : view === "month"
        ? [monthStart, addDays(monthStart, 42)]
        : view === "week"
          ? [weekStart, addDays(weekStart, 7)]
          : [weekStart < focus ? weekStart : focus, addDays(focus, 1 + Math.max(comingDays, 7))]
  const { data: occurrences = [], isPending, refetch } = useOccurrences(secs(from), secs(to))
  const loading = isPending && occurrences.length === 0

  // The list layouts: Upcoming and the Day's cards. Beside a detail column (expanded) they are the views that select.
  const listView = view === "agenda" || (view === "day" && !hours)
  const wide = frame.split && !listView
  const selectedKey = selected ? occurrenceKey(selected) : null
  // A birthday is the contact's: open the card, not an event view.
  const select = (o: Occurrence) => (o.contactId ? useUi.getState().jumpTo({ kind: "contact", id: o.contactId }) : setSelected({ eventId: o.eventId, start: o.start }))
  const swatches = useMemo(() => calendarSwatches(calendars.values()), [calendars])
  const ctx: CardContext = {
    swatches,
    selecting: frame.split && listView,
    selected: selectedKey,
    next: nextUp(occurrences, nowSecs),
    now: nowSecs,
    onOpen: select,
  }

  const step = (n: number) => setFocus(view === "week" ? addDays(focus, 7 * n) : view === "month" ? addMonths(focus, n) : addDays(focus, n))
  const goToday = () => setFocus(today)
  const todayInView = view === "week" ? week.some((d) => sameDay(d, today)) : view === "month" ? today.getMonth() === focus.getMonth() && today.getFullYear() === focus.getFullYear() : sameDay(focus, today)

  // Keyboard (ADR-0032): your keys for today, the four ranges, and paging. Never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return
      // Settings and Search cover the calendar (ADR-0075, ADR-0085); its keys wait.
      if (useUi.getState().settings || useUi.getState().search) return
      const run: Record<string, () => void> = {
        "calendar.today": goToday,
        "calendar.day": () => setView("day"),
        "calendar.week": () => setView("week"),
        "calendar.agenda": () => setView("agenda"),
        "calendar.month": () => setView("month"),
        "calendar.previous": () => view !== "agenda" && step(-1),
        "calendar.next": () => view !== "agenda" && step(1),
      }
      const command = commandFor(keys, "calendar", e.key)
      if (command) run[command]?.()
      else if (e.key === "?") useUi.getState().setShortcutsOpen(true)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const createAt = (at: Date) => {
    const end = new Date(at.getTime() + 3_600_000)
    openEditor({ initial: { start: `${dateInput(at)}T${timeInput(at)}`, end: `${dateInput(end)}T${timeInput(end)}` } })
  }
  const openEvent = (eventId: string, start: number) => {
    setFocus(startOfDay(fromSecs(start)))
    setSelected({ eventId, start })
  }

  // The head (brief C1): the month in view as the overline, the range as the title.
  const tool = place === "tasks" ? "Tasks" : place === "booking" ? "Booking links" : null
  const inMonth = view === "week" ? addDays(weekStart, 3) : focus
  const overline = view === "agenda" ? `Upcoming // ${upcomingDays} days` : `Calendar // ${inMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
  const title =
    view === "agenda" ? "Coming up" : view === "day" ? focus.toLocaleDateString(undefined, { weekday: "long" }) : view === "week" ? `Week ${weekNumber(weekStart)}` : focus.toLocaleDateString(undefined, { month: "long" })
  const meta = view === "day" ? monthDay(focus) : view === "month" ? String(focus.getFullYear()) : undefined

  // What the shell says about this screen (ADR-0083): the range as the place, its dates as the fact.
  useScreenPlace(tool ?? (view === "agenda" ? "Upcoming" : title))
  useScreenFact(
    tool
      ? null
      : view === "agenda"
        ? rangeFact(today, addDays(today, upcomingDays - 1))
        : view === "day"
          ? folio(focus)
          : view === "week"
            ? rangeFact(weekStart, addDays(weekStart, 6))
            : rangeFact(monthFirst, new Date(focus.getFullYear(), focus.getMonth() + 1, 0)),
  )
  useRefresh(refetch)
  // A second tap on Calendar's tab, or its breadcrumb: back to the calendar itself, with nothing open.
  const toRoot = () => {
    setPlace("calendar")
    setSelected(null)
  }
  useScreenRoot(toRoot)

  // An account's calendars that did not sync: Calendar's one banner (brief X4, channel 4).
  const failing = accounts.find((a) => a.davError)
  const banner = useMemo<SectionBanner | null>(
    () =>
      failing
        ? { title: `${failing.displayName} calendars didn't sync`, body: failing.davError ?? undefined, action: { label: "Open Accounts", onClick: () => useUi.getState().openSettings("accounts") } }
        : null,
    [failing],
  )
  useSectionBanner("calendar", banner)

  // The page head opens the calendars wherever the sidebar does not list them (brief X1).
  const switching = useSectionSwitcher("Change calendars.")
  const switcherLayer = (
    <div className="relative">
      <SectionSwitcher state={switching} overline={`Calendar // ${tool ?? RANGE_NAME[view]}`} title="Calendars">
        <CalendarNav standalone />
      </SectionSwitcher>
    </div>
  )
  // Every calendar hidden: say so, and the one way back (brief C1, States).
  const allHidden = calendars.size > 0 && [...calendars.values()].every((c) => c.hidden)
  const showCalendars = () => {
    if (switching.switcher) switching.setOpen(true)
    else document.querySelector<HTMLElement>('nav[aria-label="Vale"] [role="checkbox"]')?.focus()
  }

  const chips = <RangeChips view={view} phone={phone} onChange={setView} keys={keys} />
  const hoursToggle = (view === "day" || view === "week") && (
    <IconButton label="Hours" icon="time" size="icon-sm" render={<Toggle pressed={prefs.hours} onPressedChange={setCalendarHours} />} />
  )
  const steps = view !== "agenda" && <PagingSteps view={view} todayInView={todayInView} onToday={goToday} onStep={step} keys={keys} />
  // Under the head. A phone: the chips, with TODAY, previous and next at their right. Wider: a paging row, under
  // the chips in the list column; under the head where the chips stand in its actions.
  const paging = view !== "agenda" && (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Paging">
      {steps}
      <GoToDate value={focus} onPick={(d) => setFocus(startOfDay(d))} />
      {hoursToggle}
    </div>
  )
  const below: ReactNode = phone ? (
    <>
      {switcherLayer}
      <div className="flex items-center justify-between gap-2">
        {chips}
        <div className="flex items-center gap-1">{steps}</div>
      </div>
    </>
  ) : wide ? (
    <>
      {switcherLayer}
      {paging}
    </>
  ) : (
    <>
      {switcherLayer}
      <div className="flex flex-col gap-3">
        {chips}
        {paging}
      </div>
    </>
  )
  const head = tool ? (
    <>
      {/* Tasks counts its open items (brief C6): `TASKS // 07`. */}
      <ScreenHead overline={place === "tasks" ? tasksOverline(openTasks.length) : "Calendar"} title={tool} switcher={switching.switcher} below={switcherLayer} />
    </>
  ) : (
    <ScreenHead overline={overline} title={title} meta={meta} switcher={switching.switcher} actions={wide ? chips : undefined} below={below} />
  )

  // The view itself.
  const strip = <WeekStrip start={weekStart} picked={focus} today={today} onPick={(d) => setFocus(startOfDay(d))} count={(d) => eventsOn(occurrences, d).length} />
  const body: ReactNode = allHidden ? (
    <EmptyState overline="Calendar" title="Every calendar is hidden." body="Show a calendar to see its events here." actionLabel="Show calendars" onAction={showCalendars} />
  ) : view === "agenda" ? (
    <Upcoming from={today} days={upcomingDays} occurrences={occurrences} ctx={ctx} loading={loading} onMore={() => setUpcomingDays((d) => d + 30)} />
  ) : view === "day" && !hours ? (
    <div className="flex flex-col gap-6">
      {strip}
      <DayCards
        day={focus}
        today={today}
        occurrences={occurrences}
        coming={occurrences.filter((o) => o.start >= secs(addDays(focus, 1)) && o.start < secs(addDays(focus, 1 + comingDays)))}
        ctx={ctx}
        loading={loading}
        onMore={() => setComingDays((d) => d + 30)}
      />
    </div>
  ) : view === "day" && phone ? (
    <div className="flex flex-col gap-6">
      {strip}
      <TimeGrid days={[focus]} occurrences={occurrences} ctx={ctx} header={false} loading={loading} />
    </div>
  ) : view === "month" ? (
    <MonthGrid month={focus} occurrences={occurrences} ctx={ctx} loading={loading} onPickDay={(d) => setFocus(startOfDay(d))} onDay={(d) => (setFocus(startOfDay(d)), setView("day"))} />
  ) : view === "week" && phone ? (
    <PhoneWeek days={week} today={today} occurrences={occurrences} ctx={ctx} loading={loading} />
  ) : hours ? (
    <TimeGrid days={view === "day" ? [focus] : week} occurrences={occurrences} ctx={ctx} onCreateAt={phone ? undefined : createAt} loading={loading} fill={wide} />
  ) : (
    <WeekCards days={week} today={today} occurrences={occurrences} ctx={ctx} loading={loading} onKeyDown={moveBetweenEvents} />
  )

  // A task's plan stands in the detail column on a desktop (brief C6); an event opened from Tasks, otherwise.
  const detail = place === "tasks" && planning && frame.split ? <TaskPlanPane onOpen={openEvent} /> : selected && <EventDetailPane key={selectedKey} eventId={selected.eventId} start={selected.start} calendars={calendars} onDeleted={() => setSelected(null)} />
  const forms = (
    <>
      {/* What the calendars list opens (brief X1): the holidays picker by its intent, and the form that names a set. */}
      <AddCalendarsDialog />
      <SaveSetLayer />
    </>
  )

  if (wide && !tool) {
    return (
      <>
        <AppFrameColumn aria-label="Calendar" data-scroll-root="">
          {/* The time grid fills the column and scrolls its hours inside it; the cards and the month scroll with the column. */}
          <div className={hours ? "flex h-full min-h-0 flex-col" : "flex flex-col"}>
            <DemoBar in="column" />
            {head}
            <SectionNotice in="column" />
            <div className={hours ? "flex min-h-0 flex-1 flex-col" : undefined} aria-busy={loading || calendarsPending || undefined}>
              {body}
            </div>
          </div>
        </AppFrameColumn>
        {/* An event from the Week, the Month or the Day's hours: the review dialog of 560 (brief C2, Q2). */}
        <EventReview eventId={selected?.eventId ?? null} start={selected?.start ?? 0} calendars={calendars} onClose={() => setSelected(null)} />
        {forms}
      </>
    )
  }

  return (
    <>
      <MasterDetail
        section={tool ?? "Calendar"}
        pick={place === "tasks" ? "Plan a task to block time for it here." : vertical("calendar").pick}
        header={head}
        list={
          <AppFrameInset>
            {tool ? place === "tasks" ? <TasksPanel onOpen={openEvent} onPlan={() => setSelected(null)} /> : <BookingLinks /> : body}
          </AppFrameInset>
        }
        detail={detail}
        onBack={() => setSelected(null)}
        onRoot={toRoot}
      />
      {forms}
    </>
  )
}
