import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"

import { useUi } from "@/app/ui-store"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import {
  AdaptiveMenu,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  AppFrameInset,
  AppFramePageHead,
  Banner,
  Button,
  Checkbox,
  EmptyState,
  FieldRow,
  FieldRowAction,
  FilterChip,
  FilterChipGroup,
  Icon,
  ListRow,
  Skeleton,
  TextField,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useCollections, useNotesPrefs } from "@/core/queries"
import type { Collection, NoteTask, TimeSlot } from "@/core/types"
import { useConfirm } from "@/lib/confirm"
import { leaveThen, useLeaveGuard } from "@/lib/leave-guard"
import { calendarSwatches, swatchSquare } from "@/lib/swatches"

import { setTaskDone } from "../notes/checklists"
import { clock, dateInput, deviceTimeZone, folio, fromInputs, fromSecs, secs, timeInput } from "./dates"
import { DateField } from "./event-editor"
import { planTask, stopPlanning, useOpenTasks, usePlanning } from "./planning"

/** How many rows a long list shows before SHOW ALL (as before, ADR-0028). */
const SHOWN = 5
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** A task's key: its note and its place among the note's items. */
const keyOf = (t: NoteTask) => `${t.noteId}:${t.index}`
/** "Wed 11.18 16:30": when a task is planned, as a mono line writes it (the line sets the capitals). */
const when = (s: number) => `${folio(fromSecs(s))} ${clock(s)}`

/**
 * Tasks (ADR-0028, ADR-0100; brief C6): the open checklist items from your
 * notes, so an intention becomes a block of time. A task stays in its note;
 * checking it here checks it there, with UNDO. It is a place of Calendar
 * (ADR-0084): the list column, or the whole screen on a phone.
 *
 * Each row: a Checkbox, the task's words, a mono line with its note's title
 * and, once planned, `PLANNED WED 16:30` as a link to the event; then PLAN or
 * PLAN AGAIN.
 */
export function TasksPanel({ onOpen, onPlan }: { onOpen: (eventId: string, start: number) => void; /** A plan starts: the view closes an event open beside the list. */ onPlan?: () => void }) {
  const { data: tasks = [], isPending, error, refetch } = useOpenTasks()
  const { data: prefs } = useNotesPrefs()
  const [all, setAll] = useState(false)
  const planning = usePlanning((s) => s.task)
  const split = useAppFrame().split
  const qc = useQueryClient()
  const shown = all ? tasks : tasks.slice(0, SHOWN)
  // Leaving Tasks closes a plan left open (with changes, the move asked first).
  useEffect(() => stopPlanning, [])

  const check = async (t: NoteTask, done: boolean) => {
    try {
      const core = await getCoreClient()
      await setTaskDone(core, t, done, prefs?.sortChecked ?? true)
      await qc.invalidateQueries({ queryKey: ["notes"], predicate: (q) => q.queryKey[1] !== "note" })
      if (done) {
        if (planning && keyOf(planning) === keyOf(t)) stopPlanning()
        toast(`Done: ${t.text}`, { action: { label: "Undo", onClick: () => void check(t, false) } })
      }
    } catch (e) {
      toast.error(message(e))
    }
  }
  // The planned link opens its event: in the detail column, or pushed.
  const open = (t: NoteTask) =>
    t.planned &&
    leaveThen(() => {
      stopPlanning()
      onOpen(t.planned!.eventId, t.planned!.start)
    })

  let body: ReactNode
  if (isPending)
    body = (
      <div className="flex flex-col gap-5" aria-hidden>
        {/* Sized by plain boxes: the library owns the bar's look (brief 4.0: two bars a row). */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid h-12 gap-2">
            <Skeleton />
            <Skeleton />
          </div>
        ))}
      </div>
    )
  else if (error && !tasks.length) body = <EmptyState tone="critical" overline="Tasks" title="Can't load tasks." body={message(error)} actionLabel="Try again" onAction={() => void refetch()} />
  else if (!tasks.length) body = <EmptyState overline="Tasks // 00" title="No tasks." body="Checklist items in your notes show up here." />
  else
    body = (
      <div className="flex flex-col gap-4">
        <ul aria-label="Open tasks" className="flex flex-col">
          {shown.map((t) => (
            <ListRow
              key={keyOf(t)}
              render={<li />}
              selected={!!planning && split && keyOf(planning) === keyOf(t)}
              // The row has no main control to say it, so the row itself does: it is the one being planned.
              aria-current={planning && split && keyOf(planning) === keyOf(t) ? "true" : undefined}
              leading={<Checkbox checked={false} onCheckedChange={(on) => on && void check(t, true)} aria-label={`Done: ${t.text}`} />}
              title={t.text}
              meta={
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{t.noteTitle || "Untitled note"}</span>
                  {t.planned && (
                    <>
                      <span aria-hidden>//</span>
                      <Button variant="link" size="inline" onClick={() => open(t)} aria-label={`Planned ${when(t.planned.start)}, open the event`}>
                        {`Planned ${when(t.planned.start)}`}
                      </Button>
                    </>
                  )}
                </span>
              }
              action={
                <Button variant="ghost" size="sm" onClick={() => planTask(t, onPlan)} aria-label={`${t.planned ? "Plan again" : "Plan"}: ${t.text}`}>
                  {t.planned ? "Plan again" : "Plan"}
                </Button>
              }
            />
          ))}
        </ul>
        {tasks.length > SHOWN && (
          <div className="flex">
            <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>
              {all ? "Show fewer" : "Show all"}
            </Button>
          </div>
        )}
      </div>
    )

  return (
    <section aria-label="Tasks" className="flex flex-col" aria-busy={isPending || undefined}>
      {body}
      {/* A phone and medium width plan in the form layer; a desktop, in the detail column. */}
      {!split && (
        <FormLayer open={!!planning} onClose={stopPlanning}>
          {planning && <PlanLayer key={keyOf(planning)} task={planning} onOpen={onOpen} />}
        </FormLayer>
      )}
    </section>
  )
}

/** The plan's values, its free times and its save, shared by the pane and the layer. */
function usePlan(task: NoteTask, onOpen: (eventId: string, start: number) => void, onDone: () => void) {
  const { data: calendars = [] } = useCollections("calendar")
  const writable = useMemo(() => calendars.filter((c) => c.writable && !c.id.startsWith("interesting:")), [calendars])
  // The next half hour, for 30 minutes, as a starting point.
  const [initial] = useState(() => {
    const start = new Date(Math.ceil(Date.now() / 1_800_000) * 1_800_000)
    const end = new Date(start.getTime() + 30 * 60_000)
    return { day: dateInput(start), start: timeInput(start), end: timeInput(end), today: dateInput(new Date()) }
  })
  const [day, setDay] = useState(initial.day)
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const firstCalendar = (writable.find((c) => !c.hidden) ?? writable[0])?.id ?? ""
  const [picked, setCalendarId] = useState<string | null>(null)
  const calendarId = picked ?? firstCalendar
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const qc = useQueryClient()
  const dirty = day !== initial.day || start !== initial.start || end !== initial.end || picked !== null
  const from = fromInputs(day, start)
  const to = fromInputs(day, end)
  const endError = to.getTime() <= from.getTime() ? "End after it starts." : null
  const minutes = Math.max(15, Math.round((to.getTime() - from.getTime()) / 60_000))

  const submit = async () => {
    if (endError || !writable.length) return
    setBusy(true)
    setError(null)
    try {
      const core = await getCoreClient()
      const e = await core.createEvent({
        calendarId: calendarId || writable[0]!.id,
        title: task.text,
        notes: `From your note “${task.noteTitle || "Untitled note"}”.`,
        start: `${day}T${start}`,
        end: `${day}T${end}`,
        allDay: false,
        timeZone: deviceTimeZone(),
        repeat: "none",
      })
      // The note links to its block, which is what makes the task "planned".
      const link = await core.noteLinkFor({ kind: "event", id: e.eventId })
      if (link) {
        const note = await core.getNote(task.noteId)
        await core.setNoteMeta(task.noteId, { links: [...note.links, link] })
      }
      await qc.invalidateQueries({ queryKey: ["notes"], predicate: (q) => q.queryKey[1] !== "note" })
      await qc.invalidateQueries({ queryKey: ["pim"] })
      toast(`Planned ${task.text}`, { action: { label: "Show", onClick: () => onOpen(e.eventId, e.start) } })
      onDone()
    } catch (err) {
      // The form stays, with the server's words above its actions (brief 4.0).
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }
  const pickSlot = (s: TimeSlot) => {
    setDay(dateInput(fromSecs(s.start)))
    setStart(timeInput(fromSecs(s.start)))
    setEnd(timeInput(fromSecs(s.end)))
  }
  return { today: initial.today, writable, day, setDay, start, setStart, end, setEnd, calendarId, setCalendarId, busy, error, dirty, endError, minutes, submit, pickSlot }
}
type Plan = ReturnType<typeof usePlan>

/**
 * The plan's words and fields (brief C6): one line, then DAY (the shared
 * date picker), STARTS, ENDS, CALENDAR, and FIND A FREE TIME.
 */
function PlanFields({ plan }: { plan: Plan }) {
  const { data: all = [] } = useCollections("calendar")
  const swatches = useMemo(() => calendarSwatches(all), [all])
  const calendar = plan.writable.find((c) => c.id === plan.calendarId)
  return (
    <div className="flex flex-col gap-6">
      <p className="type-body text-text-secondary">Block time for it. The task stays in its note.</p>
      <div className="flex flex-col gap-4">
        <DateField label="Day" name="Day" value={plan.day} onPick={plan.setDay} min={plan.today} />
        <div className="grid grid-cols-2 gap-4">
          <TextField type="time" label="Starts" value={plan.start} onChange={(e) => e.target.value && plan.setStart(e.target.value)} />
          <TextField type="time" label="Ends" value={plan.end} onChange={(e) => e.target.value && plan.setEnd(e.target.value)} error={plan.endError ?? undefined} />
        </div>
        <FreeTimes minutes={plan.minutes} onPick={plan.pickSlot} />
      </div>
      {plan.writable.length ? (
        <FieldRow
          label="Calendar"
          action={
            <AdaptiveMenu title="Calendar" align="end" trigger={<FieldRowAction type="button" aria-label="Change calendar">Change</FieldRowAction>}>
              <AdaptiveMenuRadioGroup value={plan.calendarId} onValueChange={plan.setCalendarId}>
                {plan.writable.map((c) => (
                  <AdaptiveMenuRadioItem key={c.id} value={c.id}>
                    {c.name}
                  </AdaptiveMenuRadioItem>
                ))}
              </AdaptiveMenuRadioGroup>
            </AdaptiveMenu>
          }
        >
          <CalendarName calendar={calendar} square={swatchSquare(calendar ? swatches.get(calendar.id) : null)} />
        </FieldRow>
      ) : (
        <Banner size="compact" tone="critical" body="No calendar takes new events. Add an account with a calendar first." />
      )}
    </div>
  )
}

/** The calendar as its row shows it: the 8 px swatch square, then the name. */
function CalendarName({ calendar, square }: { calendar: Collection | undefined; square: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {square && <span className={square} aria-hidden data-slot="swatch" />}
      <span className="truncate">{calendar?.name ?? "None"}</span>
    </span>
  )
}

/**
 * FIND A FREE TIME (brief C6): free slots as long as the plan, between 8 AM
 * and 8 PM, as single-choice chips; picking one sets the day and the times.
 */
function FreeTimes({ minutes, onPick }: { minutes: number; onPick: (s: TimeSlot) => void }) {
  const [slots, setSlots] = useState<TimeSlot[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const find = async () => {
    setBusy(true)
    setError(null)
    setPicked(null)
    try {
      setSlots(await (await getCoreClient()).findTimes({ from: secs(new Date()), minutes, dayStart: 8 * 60, dayEnd: 20 * 60, weekdaysOnly: false, limit: 4 }))
    } catch (e) {
      // A failed action: one critical line beside the control, in the server's words (decisions §9).
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2" data-slot="free-times">
      <div className="flex">
        <Button type="button" variant="ghost" size="sm" loading={busy} onClick={() => void find()}>
          <Icon name="event--schedule" /> Find a free time
        </Button>
      </div>
      {error && (
        <p className="type-caption text-critical-text" role="alert">
          {error}
        </p>
      )}
      {slots && slots.length === 0 && <p className="type-caption text-text-secondary">Nothing free soon between 8 AM and 8 PM.</p>}
      {slots && slots.length > 0 && (
        <FilterChipGroup
          type="single"
          label="Free times"
          value={picked}
          onValueChange={(v) => {
            const s = slots.find((x) => String(x.start) === v)
            if (!s) return
            setPicked(v)
            onPick(s)
          }}
        >
          {slots.map((s) => (
            <FilterChip key={s.start} value={String(s.start)}>
              {when(s.start)}
            </FilterChip>
          ))}
        </FilterChipGroup>
      )}
    </div>
  )
}

const openNote = (t: NoteTask) => useUi.getState().jumpTo({ kind: "note", id: t.noteId })

/**
 * The plan in the detail column (a desktop): the overline `PLAN // {NOTE}`,
 * the task's words as the title, the fields, then PLAN (the column's one
 * primary), OPEN NOTE and CANCEL. Any move away with changes asks first
 * (brief X6): the places store waits, and so do the list's own moves.
 */
export function TaskPlanPane({ onOpen }: { onOpen: (eventId: string, start: number) => void }) {
  const task = usePlanning((s) => s.task)
  if (!task) return null
  return <PlanPane key={keyOf(task)} task={task} onOpen={onOpen} />
}

function PlanPane({ task, onOpen }: { task: NoteTask; onOpen: (eventId: string, start: number) => void }) {
  const plan = usePlan(task, onOpen, stopPlanning)
  useLeaveGuard(plan.dirty, stopPlanning)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void plan.submit()
  }
  const keys = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void plan.submit()
    } else if (e.key === "Escape" && !e.defaultPrevented) leaveThen(stopPlanning)
  }
  return (
    <AppFrameInset>
      <AppFramePageHead overline={`Plan // ${task.noteTitle || "Untitled note"}`} title={task.text} size="md" />
      <form className="flex flex-col gap-8" aria-label={`Plan ${task.text}`} onSubmit={submit} onKeyDown={keys} data-slot="task-plan">
        <PlanFields plan={plan} />
        {plan.error && <Banner size="compact" tone="critical" body={plan.error} />}
        <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Plan actions">
          <Button type="submit" loading={plan.busy} disabled={!!plan.endError || !plan.writable.length} aria-keyshortcuts="Control+Enter Meta+Enter">
            Plan
          </Button>
          <Button type="button" variant="secondary" onClick={() => openNote(task)}>
            Open note
          </Button>
          <Button type="button" variant="ghost" onClick={() => leaveThen(stopPlanning)}>
            Cancel
          </Button>
        </div>
      </form>
    </AppFrameInset>
  )
}

/** The plan in the form layer (a phone, medium width): PLAN is the layer's primary; OPEN NOTE asks first when there are changes. */
function PlanLayer({ task, onOpen }: { task: NoteTask; onOpen: (eventId: string, start: number) => void }) {
  const plan = usePlan(task, onOpen, stopPlanning)
  useLeaveGuard(plan.dirty)
  const confirm = useConfirm()
  const toNote = async () => {
    if (plan.dirty && !(await confirm.ask({ title: "Discard changes?", confirmLabel: "Discard", cancelLabel: "Keep editing" }))) return
    stopPlanning()
    openNote(task)
  }
  return (
    <FormLayerForm
      overline={`Plan // ${task.noteTitle || "Untitled note"}`}
      title={task.text}
      primary={{ label: "Plan", disabled: !!plan.endError || !plan.writable.length, loading: plan.busy }}
      error={plan.error}
      onSubmit={() => void plan.submit()}
      footerStart={
        <Button type="button" variant="secondary" onClick={() => void toNote()}>
          Open note
        </Button>
      }
    >
      <PlanFields plan={plan} />
      {confirm.question()}
    </FormLayerForm>
  )
}
