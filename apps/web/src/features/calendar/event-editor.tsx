import { useState, type KeyboardEvent } from "react"

import { useUi, type EventEditorState } from "@/app/ui-store"
import { DatePicker } from "@/components/date-picker"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { RecipientField } from "@/components/recipient-field"
import { hasWrongAddress } from "@/components/recipients"
import { ZonePicker } from "@/components/zone-picker"
import {
  AdaptiveMenu,
  AdaptiveMenuItem,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  Banner,
  Button,
  Chip,
  ChipRemove,
  FieldRow,
  FieldRowAction,
  IconButton,
  SectionHeader,
  TextField,
  ToggleRow,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { useAccounts, useCollections, usePimAction } from "@/core/queries"
import type { Collection, EventInput, Repeat } from "@/core/types"
import { useLeaveGuard } from "@/lib/leave-guard"
import { meetingLink } from "@/lib/meeting-info"
import { calendarSwatches, swatchSquare } from "@/lib/swatches"

import { formatRecipients, parseRecipients } from "../mail/format"
import { addDays, clock, dateInput, dayLabel, deviceTimeZone, folio, fromInputs, secs, timeInput } from "./dates"
import { FindATime } from "./find-a-time"
import { parseQuickAdd, type QuickEvent } from "./quick-add"
import { REMINDER_PRESETS, reminderLabel, travelLabel } from "./reminders"
import { meetingService } from "./meeting"
import { deviceZone, zoneLabel, zonedDate, zonedInput } from "./zones"

/** A fresh Jitsi room: unguessable, readable in a link. */
function jitsiRoom() {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  const id = Array.from(bytes, (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("")
  return `https://meet.jit.si/Vale-${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`
}

/** Minutes; how long getting there takes, blocked out before the start (brief C3: 5 to 120). */
const TRAVEL_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120]

const REPEAT_LABELS: [Repeat, string][] = [
  ["none", "Does not repeat"],
  ["daily", "Every day"],
  ["weekly", "Every week"],
  ["monthly", "Every month"],
  ["yearly", "Every year"],
]

/** Mounted once at the app root; opens whenever `useUi().eventEditor` is set. */
export function EventEditor() {
  const state = useUi((s) => s.eventEditor)
  const close = useUi((s) => s.closeEventEditor)
  return (
    <FormLayer open={state !== null} onClose={close}>
      {state && <EventForm key={JSON.stringify(state)} state={state} onDone={close} />}
    </FormLayer>
  )
}

/** Splits "2026-10-14T09:30" (or a date) into the form's date and time fields. */
function split(s: string | undefined, fallback: Date) {
  if (!s) return { date: dateInput(fallback), time: timeInput(fallback) }
  const [date, time] = s.split("T")
  return { date: date!, time: time?.slice(0, 5) ?? timeInput(fallback) }
}

function nextHalfHour() {
  const d = new Date()
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return d
}

/**
 * A date field (brief C3): the Text Field box showing "Fri 11.20". A press
 * on it, or its calendar button, opens the month grid; the button is named
 * "Start date, Friday, November 20, 2026".
 */
export function DateField({ label, name, value, onPick, min }: { label?: string; name: string; value: string; onPick: (date: string) => void; min?: string }) {
  const [open, setOpen] = useState(false)
  const d = fromInputs(value)
  const spoken = `${name}, ${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`
  return (
    <TextField
      label={label}
      aria-label={label ? undefined : name}
      readOnly
      tabIndex={-1}
      value={folio(d)}
      onClick={() => setOpen(true)}
      trailing={<DatePicker title={name} value={value} onPick={onPick} min={min} open={open} onOpenChange={setOpen} align="end" trigger={<IconButton label={spoken} icon="calendar" size="icon-sm" />} />}
    />
  )
}

/** STARTS or ENDS: a date field and, for a timed event, the platform's time input in the Text Field box. */
function WhenField({ label, which, date, time, allDay, onDate, onTime, min }: { label: string; which: "Start" | "End"; date: string; time: string; allDay: boolean; onDate: (d: string) => void; onTime: (t: string) => void; min?: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-end gap-2" role="group" aria-label={label}>
      <div className="min-w-0 flex-1">
        <DateField label={label} name={`${which} date`} value={date} onPick={onDate} min={min} />
      </div>
      {!allDay && (
        <div className="min-w-0 flex-1">
          <TextField type="time" aria-label={`${which} time`} value={time} onChange={(ev) => ev.target.value && onTime(ev.target.value)} />
        </div>
      )}
    </div>
  )
}

/** What quick add read from the title, as a card's mono line would say it: "Lunch with Ana // Tomorrow 13:00 // Bricks Cafe". */
const quickRead = (q: QuickEvent) => [q.title, q.allDay ? dayLabel(q.start) : `${dayLabel(q.start)} ${clock(secs(q.start))}`, q.location].filter(Boolean).join(" // ")

/**
 * The event form (ADR-0099; brief C3, Desktop / 08, Mobile / 10) in the form
 * layer: what and when first (TITLE, All day, STARTS and ENDS, FIND A TIME,
 * LOCATION, INVITE), the rest under MORE as Field Rows with menus. A new
 * event's TITLE reads a sentence (brief C4): its helper says what it read,
 * and USE THIS fills the times and the place.
 */
function EventForm({ state, onDone }: { state: EventEditorState; onDone: () => void }) {
  const phone = useAppFrame().phone
  const { initial, eventId, guestOf } = state
  const scope = state.scope ?? "all"
  const single = eventId !== undefined && scope === "this"
  const series = eventId !== undefined && !!initial.repeat && initial.repeat !== "none"
  const { data: calendars = [], isPending: calendarsPending } = useCollections("calendar")
  const { data: accounts = [] } = useAccounts()
  const writable = calendars.filter((c) => c.writable)
  const save = usePimAction((c, input: EventInput) => (eventId ? c.updateEvent(eventId, input, scope, state.occurrence ?? null) : c.createEvent(input)))
  const [reminders, setReminders] = useState<number[]>(initial.reminders ?? [])
  const [guests, setGuests] = useState(formatRecipients(initial.attendees ?? []))

  const startDefault = nextHalfHour()
  const s = split(initial.start, startDefault)
  const e = split(initial.end, new Date(startDefault.getTime() + 3_600_000))
  const [title, setTitle] = useState(initial.title ?? "")
  const [location, setLocation] = useState(initial.location ?? "")
  const [notes, setNotes] = useState(initial.notes ?? "")
  const [allDay, setAllDay] = useState(initial.allDay ?? false)
  const [startDate, setStartDate] = useState(s.date)
  const [startTime, setStartTime] = useState(s.time)
  // All-day ends are exclusive in iCalendar; people think in the last day.
  const [endDate, setEndDate] = useState(initial.allDay && initial.end ? dateInput(addDays(fromInputs(e.date), -1)) : e.date)
  const [endTime, setEndTime] = useState(e.time)
  const [repeat, setRepeat] = useState<Repeat>(initial.repeat ?? "none")
  const [zone, setZone] = useState(initial.timeZone ?? deviceTimeZone())
  const [travel, setTravel] = useState(initial.travel ?? 0)
  const [chosen, setCalendarId] = useState(initial.calendarId ?? "")
  const calendarId = chosen || writable[0]?.id || ""
  const calendar = calendars.find((c) => c.id === calendarId)
  const [error, setError] = useState<string | null>(null)
  const [titleError, setTitleError] = useState(false)
  // Quick add reads the title until a time is changed by hand (brief C4).
  const [timesByHand, setTimesByHand] = useState(false)
  // Closing asks first once a value differs from when the form opened (ADR-0087).
  const values = JSON.stringify([title, location, notes, allDay, startDate, startTime, endDate, endTime, repeat, zone, travel, chosen, reminders, guests])
  const [opened] = useState(values)
  useLeaveGuard(values !== opened)
  // A call link pasted into the location or notes (an invitation's text, say).
  const found = meetingLink(location, notes)
  const quick = !eventId && !timesByHand ? parseQuickAdd(title) : null
  const read = quick?.dated ? quick : null

  // Moving the start keeps the length, like every calendar app.
  const moveStart = (date: string, time: string) => {
    const before = fromInputs(startDate, startTime)
    const after = fromInputs(date, time)
    const end = new Date(fromInputs(endDate, endTime).getTime() + (after.getTime() - before.getTime()))
    setStartDate(date)
    setStartTime(time)
    setEndDate(dateInput(end))
    setEndTime(timeInput(end))
    setTimesByHand(true)
  }
  const takeRead = (q: QuickEvent) => {
    setTitle(q.title)
    setAllDay(q.allDay)
    setStartDate(dateInput(q.start))
    setStartTime(timeInput(q.start))
    // The parser's all-day end is the day after; the form shows the last day.
    setEndDate(dateInput(q.allDay ? addDays(q.end, -1) : q.end))
    setEndTime(timeInput(q.end))
    if (q.location) setLocation(q.location)
  }

  const submit = async () => {
    setError(null)
    if (!title.trim()) return setTitleError(true)
    if (!calendarId) return
    // A guest that is not an address: the field says so; nothing is saved until it is fixed or removed.
    if (!guestOf && !single && hasWrongAddress(guests)) return
    const input: EventInput = {
      calendarId,
      title: title.trim(),
      location: location.trim() || null,
      notes: notes.trim() || null,
      allDay,
      start: allDay ? startDate : `${startDate}T${startTime}`,
      end: allDay ? dateInput(addDays(fromInputs(endDate), 1)) : `${endDate}T${endTime}`,
      timeZone: allDay ? deviceTimeZone() : zone,
      travel: allDay ? 0 : travel,
      // One occurrence doesn't repeat; the series keeps its rule.
      repeat: single ? "none" : repeat,
      reminders,
      // Guests belong to the organizer; one-occurrence edits keep the series' list.
      attendees: guestOf || single ? undefined : parseRecipients(guests),
    }
    try {
      await save.mutateAsync(input)
      toast.success(eventId ? `Updated ${input.title}` : `Added ${input.title}`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  // Enter in a one-line field does not save (brief C4); ⌘ or Ctrl + Enter does, through the form layer.
  const noEnter = (ev: KeyboardEvent<HTMLFormElement>) => {
    if (ev.key === "Enter" && !ev.metaKey && !ev.ctrlKey && ev.target instanceof HTMLInputElement) ev.preventDefault()
  }

  const accountName = (id: string | null) => (id ? (accounts.find((a) => a.id === id)?.displayName ?? "Account") : "On this device")
  const groups = [...new Set(writable.map((c) => c.accountId))]
  const swatches = calendarSwatches(calendars)
  const size = phone ? "stacked" : "default"

  // One notice at the top (brief C3): which events change, and whose event it is.
  const scopeNote = series ? (scope === "this" ? "Changes apply to this event only." : scope === "following" ? "Changes apply to this and following events." : "Changes apply to every event in this series.") : null
  const guestNote = guestOf ? `${guestOf} organizes this event. Your changes stay on your calendar.` : null
  const notice = [scopeNote, guestNote].filter(Boolean).join(" ")
  const noCalendar = !calendarsPending && writable.length === 0
  const invites = !guestOf && !single
  const inviteNote = calendar?.accountId
    ? calendar.scheduling
      ? "Your calendar server sends the invitations."
      : `Invitations go out from ${accountName(calendar.accountId)} when you save.`
    : "Invitations need a calendar on a mail account."

  const at = zonedDate(startDate, startTime, zone)
  const until = zonedDate(endDate, endTime, zone)
  const zoneValid = !Number.isNaN(at.getTime()) && !Number.isNaN(until.getTime())
  const leaveAt = zoneValid && travel > 0 ? clock(secs(at) - travel * 60) : null
  const what = eventId ? "Edit event" : "New event"

  return (
    <FormLayerForm
      overline={calendar ? `${what} // ${calendar.name}` : what}
      title={title.trim() || what}
      primary={{ label: "Save event", loading: save.isPending }}
      error={error}
      onSubmit={() => void submit()}
      onKeyDown={noEnter}
    >
      <div className="flex flex-col gap-4" data-slot="event-form">
        {notice && <Banner size="compact" tone="info" body={notice} />}
        {noCalendar && (
          <Banner
            size="compact"
            tone="critical"
            title="No calendar you can write to."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  onDone()
                  useUi.getState().openSettings("accounts")
                }}
              >
                Open accounts
              </Button>
            }
          />
        )}
        <TextField
          label="Title"
          value={title}
          onChange={(ev) => {
            setTitle(ev.target.value)
            setTitleError(false)
          }}
          data-form-focus=""
          error={titleError ? "Give the event a title." : undefined}
          helper={
            read ? (
              <span className="flex flex-wrap items-center gap-x-2" data-slot="quick-read">
                <span>{quickRead(read)}</span>
                <Button type="button" variant="ghost" size="xs" onClick={() => takeRead(read)}>
                  Use this
                </Button>
              </span>
            ) : undefined
          }
        />
        <ToggleRow label="All day" description="Shows across the top of each day." checked={allDay} onCheckedChange={setAllDay} rule="bottom" />
        <div className={phone ? "flex flex-col gap-4" : "flex gap-4"}>
          <WhenField label="Starts" which="Start" date={startDate} time={startTime} allDay={allDay} onDate={(d) => moveStart(d, startTime)} onTime={(t) => moveStart(startDate, t)} />
          <WhenField
            label="Ends"
            which="End"
            date={endDate}
            time={endTime}
            allDay={allDay}
            min={startDate}
            onDate={(d) => (setEndDate(d), setTimesByHand(true))}
            onTime={(t) => (setEndTime(t), setTimesByHand(true))}
          />
        </div>
        {!allDay && !guestOf && (
          <FindATime
            date={startDate}
            minutes={Math.round((fromInputs(endDate, endTime).getTime() - fromInputs(startDate, startTime).getTime()) / 60_000) || 60}
            onPick={(from, to) => {
              // Free times are instants; write them as the event's own zone's clock.
              const [sd, st] = zonedInput(from.getTime() / 1000, zone).split("T")
              const [ed, et] = zonedInput(to.getTime() / 1000, zone).split("T")
              setStartDate(sd!)
              setStartTime(st!)
              setEndDate(ed!)
              setEndTime(et!)
              setTimesByHand(true)
            }}
          />
        )}
        <TextField
          label="Location"
          value={location}
          onChange={(ev) => setLocation(ev.target.value)}
          helper={found ? `${meetingService(found)} call. Join shows on the event.` : undefined}
          trailing={
            !found ? (
              // A Jitsi room needs no account and no sign-up: anyone with the link joins (ADR-0030).
              <Button type="button" variant="ghost" size="sm" onClick={() => setLocation(location.trim() ? `${location.trim()} · ${jitsiRoom()}` : jitsiRoom())}>
                Add video call
              </Button>
            ) : undefined
          }
        />
        {invites && (
          // The shared recipient field (ADR-0089): guests as chips; a chip that is not an address says so under the field.
          <div className="flex flex-col gap-1">
            <RecipientField id="event-guests" label="Invite" value={guests} onChange={setGuests} placeholder="Add people by name or email" />
            <p className="type-caption text-text-secondary" data-slot="invite-note">
              {inviteNote}
            </p>
          </div>
        )}

        <SectionHeader title="More" level={3} />
        <div className="flex flex-col">
          {!single && (
            <FieldRow
              size={size}
              rule="bottom"
              label="Repeat"
              action={
                <AdaptiveMenu title="Repeat" trigger={<FieldRowAction type="button">Change</FieldRowAction>} align="end">
                  <AdaptiveMenuRadioGroup value={repeat} onValueChange={(v) => setRepeat(v as Repeat)}>
                    {REPEAT_LABELS.map(([v, l]) => (
                      <AdaptiveMenuRadioItem key={v} value={v}>
                        {l}
                      </AdaptiveMenuRadioItem>
                    ))}
                    {initial.repeat === "custom" && <AdaptiveMenuRadioItem value="custom">Custom (kept as is)</AdaptiveMenuRadioItem>}
                  </AdaptiveMenuRadioGroup>
                </AdaptiveMenu>
              }
            >
              {repeat === "custom" ? "Custom (kept as is)" : (REPEAT_LABELS.find(([v]) => v === repeat)?.[1] ?? "Does not repeat")}
            </FieldRow>
          )}
          <FieldRow
            size={size}
            rule="bottom"
            label="Alert"
            action={
              <AdaptiveMenu title="Add alert" trigger={<FieldRowAction type="button" aria-label="Add alert">Add</FieldRowAction>} align="end">
                {REMINDER_PRESETS.filter((m) => !reminders.includes(m)).map((m) => (
                  <AdaptiveMenuItem key={m} onSelect={() => setReminders([...reminders, m].sort((a, b) => a - b))}>
                    {reminderLabel(m, allDay)}
                  </AdaptiveMenuItem>
                ))}
              </AdaptiveMenu>
            }
          >
            {reminders.length ? (
              <span className="flex flex-wrap gap-1 py-1" role="list" aria-label="Alerts">
                {reminders.map((m) => (
                  <Chip key={m} role="listitem">
                    {reminderLabel(m, allDay)}
                    <ChipRemove label={`Remove alert ${reminderLabel(m, allDay)}`} onClick={() => setReminders(reminders.filter((x) => x !== m))} />
                  </Chip>
                ))}
              </span>
            ) : (
              "None"
            )}
          </FieldRow>
          {!single && (
            <FieldRow
              size={size}
              rule="bottom"
              label="Calendar"
              action={
                <AdaptiveMenu title="Calendar" trigger={<FieldRowAction type="button" aria-label="Change calendar">Change</FieldRowAction>} align="end">
                  {groups.map((g) => (
                    <AdaptiveMenuRadioGroup key={g ?? "local"} label={accountName(g)} value={calendarId} onValueChange={setCalendarId}>
                      {writable
                        .filter((c) => c.accountId === g)
                        .map((c) => (
                          <AdaptiveMenuRadioItem key={c.id} value={c.id}>
                            {c.name}
                          </AdaptiveMenuRadioItem>
                        ))}
                    </AdaptiveMenuRadioGroup>
                  ))}
                </AdaptiveMenu>
              }
            >
              <CalendarName calendar={calendar} square={swatchSquare(calendar ? swatches.get(calendar.id) : null)} />
            </FieldRow>
          )}
          {!allDay && (
            <FieldRow
              size={size}
              rule="bottom"
              label="Travel"
              description={leaveAt ? `Blocked before it starts. You get a “time to leave” alert at ${leaveAt}.` : undefined}
              action={
                <AdaptiveMenu title="Travel" trigger={<FieldRowAction type="button" aria-label="Change travel time">Change</FieldRowAction>} align="end">
                  <AdaptiveMenuRadioGroup value={String(travel)} onValueChange={(v) => setTravel(Number(v))}>
                    <AdaptiveMenuRadioItem value="0">None</AdaptiveMenuRadioItem>
                    {[...new Set([...TRAVEL_PRESETS, ...(travel ? [travel] : [])])]
                      .sort((a, b) => a - b)
                      .map((m) => (
                        <AdaptiveMenuRadioItem key={m} value={String(m)}>
                          {travelLabel(m)}
                        </AdaptiveMenuRadioItem>
                      ))}
                  </AdaptiveMenuRadioGroup>
                </AdaptiveMenu>
              }
            >
              {travel ? travelLabel(travel) : "None"}
            </FieldRow>
          )}
          {!allDay && (
            <FieldRow
              size={size}
              rule="bottom"
              label="Time zone"
              description={
                zone !== deviceZone() && zoneValid ? (
                  <span data-slot="zone-note">{`That is ${folio(at)}, ${clock(secs(at))} – ${at.toDateString() === until.toDateString() ? "" : `${folio(until)}, `}${clock(secs(until))} your time.`}</span>
                ) : undefined
              }
              action={
                // Every zone, found by typing (brief C3): "Yours" first (ADR-0088).
                <ZonePicker value={zone} onPick={(z) => setZone(z ?? deviceZone())} at={zoneValid ? at : undefined} trigger={<FieldRowAction type="button" aria-label="Change time zone">Change</FieldRowAction>} />
              }
            >
              <span data-slot="event-zone">{zoneLabel(zone, zoneValid ? at : undefined)}</span>
            </FieldRow>
          )}
        </div>
        <TextField label="Notes" multiline minRows={4} value={notes} onChange={(ev) => setNotes(ev.target.value)} />
      </div>
    </FormLayerForm>
  )
}

/** The calendar as the CALENDAR row shows it: its 8 px swatch square, then its name. */
function CalendarName({ calendar, square }: { calendar: Collection | undefined; square: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {square && <span className={square} aria-hidden data-slot="swatch" />}
      <span className="truncate">{calendar?.name ?? "None"}</span>
    </span>
  )
}
